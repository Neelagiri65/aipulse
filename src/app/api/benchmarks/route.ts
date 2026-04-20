/**
 * Public read endpoint for the Chatbot Arena benchmarks panel.
 *
 * Data source: `data/benchmarks/lmarena-latest.json`, committed to the
 * repo by the daily `benchmarks-ingest-lmarena` GH Actions cron. This
 * route never hits the HuggingFace Datasets Server directly — all live
 * fetches happen on the cron write path so user page-views never amplify
 * upstream load (same posture as /api/hn).
 *
 * CDN caching: s-maxage=3600 (1h) matches the daily ingest cadence with
 * generous slack — the JSON only mutates when lmarena-ai publishes a
 * new `leaderboard_publish_date`, at most once/day. stale-while-
 * revalidate=86400 (24h) keeps the panel live if the static file-read
 * ever flaps (it won't on Vercel's edge CDN).
 *
 * Degradation: first-deploy state (before cron has written) ships the
 * bootstrap `{ ok: false, reason: "not_yet_ingested" }` from the
 * committed JSON. Panel renders "Awaiting first ingest" row (PRD AC 13).
 */

import type { BenchmarksPayload } from "@/lib/data/benchmarks-lmarena";
import payload from "../../../../data/benchmarks/lmarena-latest.json";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  return Response.json(payload as BenchmarksPayload, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
