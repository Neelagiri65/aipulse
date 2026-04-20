/**
 * Public read endpoint for the regional RSS layer — 5 curated non-HN
 * publisher feeds (London, Hannover, Beijing, New Delhi, Cambridge MA).
 *
 * Consumed by Dashboard polling (10-min cadence; publisher feeds update
 * far slower than HN, so we don't need minute-level freshness) and
 * rendered in the Regional Wire panel + amber map layer.
 *
 * Data source: Upstash Redis keyspace `rss:*`, populated every 30min
 * by the /api/wire/ingest-rss cron. Assembly is exactly 4 Redis
 * commands per origin hit (1 ZRANGE + 1 MGET items + 1 MGET source
 * statuses + 1 GET meta) — mirrors the HN pattern.
 *
 * CDN caching: s-maxage=60 matches the client poll cadence loosely and
 * amortises origin hits across concurrent viewers in a region.
 * stale-while-revalidate=300 keeps the panel alive if Redis flaps.
 *
 * Degradation: Redis unavailable → empty shape with source:"unavailable".
 * The panel renders the grey-card fallback; no synthetic data ever.
 */

import { readRssWire } from "@/lib/data/rss-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await readRssWire();
  return Response.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
