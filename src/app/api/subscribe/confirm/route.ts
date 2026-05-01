/**
 * GET /api/subscribe/confirm?token=... — double-opt-in second leg.
 *
 * Always returns a 302 to /subscribe/confirm?state=... so users land on
 * the real UI regardless of outcome. The `state` query param drives the
 * copy in that page (success / expired / invalid / not-found / error).
 *
 * State mapping:
 *   missing-token       → invalid
 *   malformed signature → invalid
 *   expired             → expired
 *   not in Redis        → not-found
 *   already confirmed   → ok (idempotent re-click)
 *   flip succeeds       → ok
 */

import { NextResponse } from "next/server";
import {
  jsonError,
  withUserRoute,
  type UserRouteContext,
} from "@/app/api/_lib/userRoute";
import { verifyToken } from "@/lib/email/hash";
import {
  deleteConfirmToken,
  findByConfirmToken,
  readSubscriber,
  updateSubscriberStatus,
  type SubscriberClient,
} from "@/lib/data/subscribers";
import { optionalEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ConfirmDeps = {
  subscriberClient?: SubscriberClient;
  now?: () => number;
  tokenSecret?: string;
};

export type ConfirmState = "ok" | "expired" | "invalid" | "not-found" | "error";

export async function handleConfirm(
  ctx: UserRouteContext,
  deps: ConfirmDeps = {},
): Promise<NextResponse> {
  const { request, traceId } = ctx;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) return redirect(request, "invalid", traceId);

  let verification;
  try {
    verification = verifyToken(token, deps.tokenSecret, deps.now?.());
  } catch {
    return jsonError(
      { status: 503, code: "TOKEN_SECRET_MISSING", message: "server misconfigured" },
      traceId,
    );
  }
  if (!verification.valid) {
    const state: ConfirmState =
      verification.reason === "expired" ? "expired" : "invalid";
    return redirect(request, state, traceId);
  }
  if (verification.payload.kind !== "confirm") {
    return redirect(request, "invalid", traceId);
  }

  const record = await findByConfirmToken(token, {
    client: deps.subscriberClient,
  });
  if (!record) {
    // Token reverse-index miss. Two real-world causes:
    //   (a) email-client link prefetch — iOS Mail / Gmail / Outlook hit
    //       confirmation URLs to scan for malware, which consumes the
    //       index before the human ever taps the button;
    //   (b) the user double-clicked the link.
    // The token signature itself is HMAC-verified above, so we trust the
    // emailHash baked into the payload and look up the subscriber that
    // way. If they're already confirmed, the click is a successful
    // idempotent re-confirmation, not a "not-found".
    const fallback = await readSubscriber(verification.payload.emailHash, {
      client: deps.subscriberClient,
    });
    if (fallback?.status === "confirmed") {
      return redirect(request, "ok", traceId);
    }
    return redirect(request, "not-found", traceId);
  }

  if (record.status === "confirmed") {
    return redirect(request, "ok", traceId);
  }

  const updated = await updateSubscriberStatus(
    record.emailHash,
    {
      status: "confirmed",
      confirmedAt: new Date(deps.now?.() ?? Date.now()).toISOString(),
      confirmToken: undefined,
    },
    { client: deps.subscriberClient },
  );
  await deleteConfirmToken(token, { client: deps.subscriberClient });

  if (!updated) return redirect(request, "error", traceId);
  return redirect(request, "ok", traceId);
}

export const GET = withUserRoute((ctx) => handleConfirm(ctx));

function redirect(
  request: Request,
  state: ConfirmState,
  traceId: string,
): NextResponse {
  const base =
    optionalEnv("NEXT_PUBLIC_SITE_URL") ?? new URL(request.url).origin;
  const target = new URL("/subscribe/confirm", base);
  target.searchParams.set("state", state);
  const resp = NextResponse.redirect(target, { status: 302 });
  resp.headers.set("x-aip-trace", traceId);
  return resp;
}
