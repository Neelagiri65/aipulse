/**
 * POST /api/push/send — broadcast a push notification to all subscribers.
 *
 * INGEST_SECRET gated. Called by the tool-alerts cron when a status
 * transition fires, or manually for testing.
 *
 * Body: { title: string, body: string, url?: string, tag?: string }
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { broadcastPush, type PushPayload } from "@/lib/push/send";
import { isTotalFailure } from "@/lib/data/success-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendResult = {
  sent: number;
  failed: number;
  removed: number;
};

export const POST = withIngest<SendResult>({
  workflow: "push-send",
  run: async (request) => {
    let payload: PushPayload;
    try {
      payload = await request.json();
    } catch {
      throw new Error("invalid_json");
    }

    if (!payload.title || !payload.body) {
      throw new Error("missing_title_or_body");
    }

    return broadcastPush(payload);
  },
  // Unified success contract. No subscribers (sent:0, failed:0) is
  // "nothing to do" — a green run with 0 items, not a failure. We only
  // fail the run when there WERE recipients and every send failed
  // (sent:0, failed>0): a broadcast that reached nobody despite trying.
  toOutcome: (r) =>
    isTotalFailure({ delivered: r.sent, failures: r.failed })
      ? { ok: false, error: `all ${r.failed} push sends failed` }
      : { ok: true, itemsProcessed: r.sent },
  toResponse: (r) =>
    NextResponse.json(
      { ok: !isTotalFailure({ delivered: r.sent, failures: r.failed }), result: r },
      { status: 200 },
    ),
});
