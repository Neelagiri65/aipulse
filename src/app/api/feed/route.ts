/**
 * /api/feed — ranked card stream over the existing Gawk snapshots.
 *
 * Pure derivation: delegates to the shared loader (`@/lib/feed/load`)
 * which fetches the six existing snapshots in parallel, applies
 * per-source last-known caching for the three live-HTTP sources
 * (status, research, labs), and runs the deterministic derivers.
 *
 * The loader is shared with the root server component so SSR and the
 * client refresh produce identical FeedResponses — no new sources, no
 * LLM, no scoring beyond the locked severity tiers declared on
 * /methodology.
 */

import { NextResponse } from "next/server";

import { loadFeedResponse } from "@/lib/feed/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const response = await loadFeedResponse(Date.now());
  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
