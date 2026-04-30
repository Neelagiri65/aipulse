/**
 * POST /api/wire/ingest-reddit — cron-driven ingest pass over the
 * curated subreddit slate.
 *
 * Auth: shared INGEST_SECRET via withIngest. Records cron-health
 * automatically. itemsProcessed is the sum of `written` across all
 * subs, so a green cron with itemsProcessed:0 means "ingest ran but
 * Reddit returned zero new items in the last poll" — distinct from
 * a failure.
 */

import { NextResponse } from "next/server";

import { withIngest } from "@/app/api/_lib/withIngest";
import { runRedditIngest } from "@/lib/data/reddit-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withIngest({
  workflow: "wire-ingest-reddit",
  run: async () => {
    return runRedditIngest({ nowIso: new Date().toISOString() });
  },
  toOutcome: (r) => {
    if (!r.ok) {
      const err = r.sources
        .filter((s) => s.error)
        .map((s) => `${s.id}: ${s.error}`)
        .join("; ");
      return { ok: false, error: err || "unknown ingest failure" };
    }
    const itemsProcessed = r.sources.reduce((n, s) => n + s.written, 0);
    return { ok: true, itemsProcessed };
  },
  toResponse: (r) => NextResponse.json({ ok: r.ok, result: r }),
});

export const GET = POST;
