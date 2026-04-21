/**
 * GET /api/subscribe/unsubscribe?token=... — one-click unsubscribe.
 *
 * Mailbox providers follow the List-Unsubscribe header as GET requests
 * without prior consent, so this endpoint must be idempotent and GET-safe:
 * never require a POST, never require a session, never ask for confirm.
 *
 * Redirects to /subscribe/unsubscribed?state=... regardless of outcome.
 * On a valid token we also send the unsubscribe-receipt email — but only
 * on the *first* successful flip, so repeat clicks don't spam.
 */

import { NextResponse } from "next/server";
import {
  jsonError,
  withUserRoute,
  type UserRouteContext,
} from "@/app/api/_lib/userRoute";
import { verifyToken } from "@/lib/email/hash";
import {
  findByUnsubToken,
  updateSubscriberStatus,
  type SubscriberClient,
} from "@/lib/data/subscribers";
import { sendUnsubscribeReceipt, type EmailSender } from "@/lib/email/resend";
import { optionalEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type UnsubscribeDeps = {
  subscriberClient?: SubscriberClient;
  sender?: EmailSender;
  now?: () => number;
  tokenSecret?: string;
  /** Address resolution. Unlike hashing, the receipt email needs the
   *  original address. Since we only store the hash, the caller must
   *  supply a lookup when one is wired up. Day 1: receipt is skipped
   *  when no resolver is supplied — Resend will still honour the
   *  List-Unsubscribe click. */
  resolveEmail?: (emailHash: string) => Promise<string | null>;
};

export type UnsubState = "ok" | "invalid" | "not-found" | "error";

export async function handleUnsubscribe(
  ctx: UserRouteContext,
  deps: UnsubscribeDeps = {},
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
  if (!verification.valid) return redirect(request, "invalid", traceId);
  if (verification.payload.kind !== "unsub") {
    return redirect(request, "invalid", traceId);
  }

  const record = await findByUnsubToken(token, {
    client: deps.subscriberClient,
  });
  if (!record) return redirect(request, "not-found", traceId);

  if (record.status === "unsubscribed") {
    return redirect(request, "ok", traceId);
  }

  const updated = await updateSubscriberStatus(
    record.emailHash,
    {
      status: "unsubscribed",
      unsubscribedAt: new Date(deps.now?.() ?? Date.now()).toISOString(),
      // Clear the encrypted plaintext so a former subscriber's address
      // is not retained. The emailHash stays for the anonymised count.
      encryptedEmail: null,
    },
    { client: deps.subscriberClient },
  );
  if (!updated) return redirect(request, "error", traceId);

  if (deps.resolveEmail) {
    const address = await deps.resolveEmail(record.emailHash);
    if (address) {
      const base =
        optionalEnv("NEXT_PUBLIC_SITE_URL") ?? new URL(request.url).origin;
      await sendUnsubscribeReceipt({
        to: address,
        resubscribeUrl: new URL("/subscribe", base).toString(),
        sender: deps.sender,
      });
    }
  }

  return redirect(request, "ok", traceId);
}

export const GET = withUserRoute((ctx) => handleUnsubscribe(ctx));
/**
 * POST mirrors GET so mailbox providers that send the RFC 8058
 * one-click POST (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`)
 * land on the same handler. Shares auth + side-effect semantics.
 */
export const POST = withUserRoute((ctx) => handleUnsubscribe(ctx));

function redirect(
  request: Request,
  state: UnsubState,
  traceId: string,
): NextResponse {
  const base =
    optionalEnv("NEXT_PUBLIC_SITE_URL") ?? new URL(request.url).origin;
  const target = new URL("/subscribe/unsubscribed", base);
  target.searchParams.set("state", state);
  const resp = NextResponse.redirect(target, { status: 302 });
  resp.headers.set("x-aip-trace", traceId);
  return resp;
}
