/**
 * POST /api/push/apns/send — send an APNs push. INGEST_SECRET gated.
 *
 * Body: { title, body, url?, tag?, toolId?, source?, generatedAt?,
 *         token?: lowercase hex device token, env?: "sandbox" | "production" }
 *
 * With `token` + `env`: ONE device, and the raw APNs status is returned —
 * this is the PRD §5a spike made permanent: hitting it from Vercel with the
 * 64-zero dummy token must answer 400 BadDeviceToken (key, JWT and HTTP/2
 * all fine from the Node runtime) rather than 403 InvalidProviderToken or a
 * transport error. Without `token`: broadcast to every stored token, same
 * as the tool-alerts cron does in-process.
 */
import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { broadcastApns, sendApnsToOne, type ApnsBroadcastResult } from "@/lib/push/apns";
import { isApnsEnv, isApnsToken } from "@/lib/push/apns-store";
import type { PushPayload } from "@/lib/push/send";
import { isTotalFailure } from "@/lib/data/success-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Result =
  | { mode: "one"; env: string; status: number; reason: string | null }
  | ({ mode: "broadcast" } & ApnsBroadcastResult);

export const POST = withIngest<Result>({
  // Same beacon as /api/push/send: a probe is a push send, not a new cron.
  workflow: "push-send",
  run: async (request) => {
    let body: PushPayload & { token?: unknown; env?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new Error("invalid_json");
    }
    if (!body.title || !body.body) throw new Error("missing_title_or_body");
    const { token, env, ...payload } = body;
    if (token !== undefined) {
      if (!isApnsToken(token)) throw new Error("invalid_token");
      if (!isApnsEnv(env)) throw new Error("invalid_env");
      const r = await sendApnsToOne(token, env, payload);
      return { mode: "one", env, status: r.status, reason: r.reason };
    }
    return { mode: "broadcast", ...(await broadcastApns(payload)) };
  },
  toOutcome: (r) =>
    r.mode === "one"
      ? r.status === 200
        ? { ok: true, itemsProcessed: 1 }
        : { ok: false, error: `apns ${r.status} ${r.reason ?? ""}`.trim() }
      : isTotalFailure({ delivered: r.sent, failures: r.failed })
        ? { ok: false, error: `all ${r.failed} apns sends failed` }
        : { ok: true, itemsProcessed: r.sent },
  toResponse: (r) =>
    NextResponse.json(
      { ok: r.mode === "one" ? r.status === 200 : !isTotalFailure({ delivered: r.sent, failures: r.failed }), result: r },
      { status: 200 },
    ),
});
