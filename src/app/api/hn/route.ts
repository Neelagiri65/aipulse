/**
 * Public read endpoint for Hacker News AI-relevant stories. Consumed
 * by Dashboard polling (1-min cadence) and rendered in THE WIRE +
 * map layers.
 *
 * Data source: Upstash Redis, populated every 15 minutes by the
 * /api/wire/ingest-hn cron. This route never calls Algolia or
 * Firebase directly — ingest-side fetches stay on the cron path so
 * user page-views don't amplify upstream load.
 *
 * CDN caching: s-maxage=60 matches the 60s client poll cadence; a
 * steady stream of viewers shares a single upstream response per
 * minute per region. stale-while-revalidate=300 keeps the card live
 * if Redis briefly flaps.
 *
 * Degradation: when Redis is unavailable the response shape stays the
 * same with items=[], source="unavailable" — Dashboard renders the
 * grey card + last-known-value fallback.
 */

import { readWire } from "@/lib/data/hn-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await readWire();
  return Response.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
