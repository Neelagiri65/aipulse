/**
 * POST /api/subscribe — double-opt-in entry point.
 *
 * Flow (each step can short-circuit with a structured error envelope):
 *   1. JSON body parse → {email, turnstileToken, website(honeypot)}
 *   2. honeypot check — anything in `website` is a bot, 400 HONEYPOT
 *   3. email shape check — validateEmail, 400 INVALID_EMAIL
 *   4. rate limit by sha256(ip) — 5/hr, 429 RATE_LIMITED
 *   5. Turnstile siteverify — fails closed on network, 400 TURNSTILE_FAILED
 *   6. hashEmail + readSubscriber:
 *        - confirmed    → 200 {status:"already_confirmed"}
 *        - pending      → re-send current confirm token, 200 {status:"resent"}
 *        - unsubscribed → treat as new subscribe (reset record)
 *        - missing      → mint tokens, write pending, send email
 *   7. sendConfirm — 5xx keeps pending (retry path), 4xx returns fatal
 *
 * Response envelope always includes `status` + `traceId`. Trace id is
 * also echoed in `x-aip-trace` by withUserRoute.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  clientIp,
  jsonError,
  withUserRoute,
  type UserRouteContext,
} from "@/app/api/_lib/userRoute";
import { validateEmail } from "@/lib/email/validation";
import { verifyTurnstile } from "@/lib/turnstile";
import { parseGeo } from "@/lib/geo";
import { hashEmail, mintToken } from "@/lib/email/hash";
import { encryptEmail } from "@/lib/mail/email-encryption";
import { sendConfirm, type EmailSender } from "@/lib/email/resend";
import {
  findByConfirmToken,
  indexConfirmToken,
  indexUnsubToken,
  readSubscriber,
  writeSubscriber,
  type SubscriberClient,
  type SubscriberRecord,
} from "@/lib/data/subscribers";
import {
  checkAndIncrement,
  type RateLimitClient,
} from "@/lib/data/rate-limit";
import { optionalEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM_TTL_SEC = 60 * 60 * 24; // 24h
const RATE_LIMIT_PER_HOUR = 5;
const RATE_WINDOW_SEC = 60 * 60;

export type SubscribeDeps = {
  subscriberClient?: SubscriberClient;
  rateLimitClient?: RateLimitClient;
  sender?: EmailSender;
  verifyFetch?: typeof fetch;
  now?: () => number;
  tokenSecret?: string;
  turnstileSecret?: string;
  /** Override the email-encryption fn for tests; default calls the real
   *  AES-GCM encrypt (which reads SUBSCRIBER_EMAIL_ENC_KEY from env). */
  encryptEmailFn?: (plaintext: string) => string | null;
};

export async function handleSubscribe(
  ctx: UserRouteContext,
  deps: SubscribeDeps = {},
): Promise<NextResponse> {
  const { request, traceId } = ctx;

  const body = await parseBody(request);
  if (!body.ok) {
    return jsonError(
      { status: 400, code: "BAD_BODY", message: "invalid JSON body" },
      traceId,
    );
  }
  const { email: rawEmail, turnstileToken, website } = body.value;

  if (typeof website === "string" && website.trim().length > 0) {
    return jsonError(
      { status: 400, code: "HONEYPOT", message: "rejected" },
      traceId,
    );
  }

  const validation = validateEmail(rawEmail);
  if (!validation.valid) {
    return jsonError(
      {
        status: 400,
        code: "INVALID_EMAIL",
        message: `email ${validation.reason}`,
      },
      traceId,
    );
  }
  const email = validation.normalised;

  const ip = clientIp(request);
  const ipHash = ip
    ? createHash("sha256").update(ip).digest("hex")
    : "unknown";
  const rate = await checkAndIncrement(
    `rl:subscribe:${ipHash}`,
    RATE_LIMIT_PER_HOUR,
    RATE_WINDOW_SEC,
    { client: deps.rateLimitClient, now: deps.now },
  );
  if (!rate.allowed) {
    const resp = jsonError(
      { status: 429, code: "RATE_LIMITED", message: "too many requests" },
      traceId,
    );
    resp.headers.set(
      "retry-after",
      String(Math.max(1, Math.floor((rate.resetAt - (deps.now?.() ?? Date.now())) / 1000))),
    );
    return resp;
  }

  const verify = await verifyTurnstile({
    token: typeof turnstileToken === "string" ? turnstileToken : "",
    remoteIp: ip,
    secret: deps.turnstileSecret,
    fetchImpl: deps.verifyFetch,
  });
  if (!verify.ok) {
    return jsonError(
      {
        status: 400,
        code: "TURNSTILE_FAILED",
        message: `captcha ${verify.reason}`,
      },
      traceId,
    );
  }

  const geo = parseGeo(request.headers);
  const emailHash = hashEmail(email);
  const existing = await readSubscriber(emailHash, {
    client: deps.subscriberClient,
  });

  if (existing && existing.status === "confirmed") {
    return ok({ status: "already_confirmed" }, traceId);
  }

  if (existing && existing.status === "pending" && existing.confirmToken) {
    // Re-send the current token. Still valid? If we can find it in the
    // reverse-lookup, yes — otherwise mint a fresh one.
    const stillIndexed = await findByConfirmToken(existing.confirmToken, {
      client: deps.subscriberClient,
    });
    if (stillIndexed) {
      const urls = buildUrls(request, existing.confirmToken, existing.unsubToken);
      const sent = await sendConfirm({
        to: email,
        confirmUrl: urls.confirm,
        unsubUrl: urls.unsub,
        sender: deps.sender,
      });
      return sent.ok
        ? ok({ status: "resent" }, traceId)
        : deliveryError(sent, traceId);
    }
  }

  const confirmToken = mintToken(
    {
      kind: "confirm",
      emailHash,
      ttlSec: CONFIRM_TTL_SEC,
      nowMs: deps.now?.(),
    },
    deps.tokenSecret,
  );
  const unsubToken =
    existing?.unsubToken ??
    mintToken(
      { kind: "unsub", emailHash, nowMs: deps.now?.() },
      deps.tokenSecret,
    );

  const createdAt = existing?.createdAt ?? new Date(deps.now?.() ?? Date.now()).toISOString();
  const encryptFn =
    deps.encryptEmailFn ??
    ((plaintext: string) => {
      try {
        return encryptEmail(plaintext);
      } catch {
        // fail-soft: if the key isn't configured or crypto throws, we
        // still write the record without plaintext — digest-send later
        // will skip this subscriber until re-encrypt runs.
        return null;
      }
    });
  const encryptedEmail = encryptFn(email);
  const record: SubscriberRecord = {
    emailHash,
    status: "pending",
    geo,
    consentCategories: existing?.consentCategories ?? {
      necessary: true,
      analytics: false,
      marketing: false,
    },
    createdAt,
    confirmToken,
    unsubToken,
    encryptedEmail,
  };

  await writeSubscriber(record, { client: deps.subscriberClient });
  await indexConfirmToken(confirmToken, emailHash, CONFIRM_TTL_SEC, {
    client: deps.subscriberClient,
  });
  await indexUnsubToken(unsubToken, emailHash, {
    client: deps.subscriberClient,
  });

  const urls = buildUrls(request, confirmToken, unsubToken);
  const sent = await sendConfirm({
    to: email,
    confirmUrl: urls.confirm,
    unsubUrl: urls.unsub,
    sender: deps.sender,
  });
  if (!sent.ok) return deliveryError(sent, traceId);

  return ok({ status: "pending" }, traceId);
}

export const POST = withUserRoute((ctx) => handleSubscribe(ctx));

function ok(
  body: Record<string, unknown>,
  traceId: string,
): NextResponse {
  const resp = NextResponse.json({ ok: true, ...body, traceId });
  resp.headers.set("x-aip-trace", traceId);
  return resp;
}

function deliveryError(
  sent: { ok: false; queued?: true; fatal?: true; error: string },
  traceId: string,
): NextResponse {
  if ("fatal" in sent && sent.fatal) {
    return jsonError(
      { status: 502, code: "DELIVERY_FATAL", message: sent.error },
      traceId,
    );
  }
  return jsonError(
    { status: 503, code: "DELIVERY_QUEUED", message: sent.error },
    traceId,
  );
}

type SubscribeBody = {
  email?: unknown;
  turnstileToken?: unknown;
  website?: unknown;
};

async function parseBody(
  request: Request,
): Promise<{ ok: true; value: SubscribeBody } | { ok: false }> {
  try {
    const value = (await request.json()) as SubscribeBody;
    if (!value || typeof value !== "object") return { ok: false };
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function buildUrls(
  request: Request,
  confirmToken: string,
  unsubToken: string,
): { confirm: string; unsub: string } {
  const base =
    optionalEnv("NEXT_PUBLIC_SITE_URL") ?? new URL(request.url).origin;
  const confirm = new URL("/api/subscribe/confirm", base);
  confirm.searchParams.set("token", confirmToken);
  const unsub = new URL("/api/subscribe/unsubscribe", base);
  unsub.searchParams.set("token", unsubToken);
  return { confirm: confirm.toString(), unsub: unsub.toString() };
}
