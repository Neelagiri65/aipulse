/**
 * Hacker News ingest endpoint — cron-driven write side of the HN
 * pipeline. Fetches recent stories from the Algolia HN API, filters
 * for AI-relevance with deterministic keyword/domain rules, resolves
 * author locations via Firebase HN user profiles, and writes items +
 * authors + wire ZSET to Upstash Redis.
 *
 * Auth: shared INGEST_SECRET (same class as /api/registry/discover
 * and /api/registry/backfill-events).
 *
 * Query params:
 *   - source=<string>   Label for ingest-meta attribution. Default
 *                       "cron". Use "manual" when dispatching by hand.
 *   - cap=<int>         Max AI-relevant stories to keep this run.
 *                       1–20, default 20.
 *
 * Cadence: invoked every 15 minutes via GitHub Actions cron
 * (.github/workflows/wire-ingest-hn.yml). The 5,20,35,50 slot keeps
 * this cron from colliding with the existing ingest jobs.
 *
 * Uses withIngest — the shared wrapper that handles INGEST_SECRET
 * auth, try/catch, and cron-health recording. Paired with the matching
 * RSS migration; the remaining five wired ingest routes (globe,
 * registry-discover, registry-discover-deps, registry-discover-topics,
 * registry-backfill-events) still inline that boilerplate and will
 * migrate one at a time as they need changes.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { runIngest } from "@/lib/data/wire-hn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withIngest({
  workflow: "wire-ingest-hn",
  run: async (request) => {
    const url = new URL(request.url);
    const source = url.searchParams.get("source") ?? "cron";
    const capParam = url.searchParams.get("cap");
    const cap = capParam
      ? clamp(Number.parseInt(capParam, 10) || 20, 1, 20)
      : 20;
    return runIngest({ cap, source });
  },
  toOutcome: (result) =>
    result.ok
      ? { ok: true, itemsProcessed: result.written }
      : {
          ok: false,
          error: result.failures[0]?.message ?? "ingest returned ok:false",
        },
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
