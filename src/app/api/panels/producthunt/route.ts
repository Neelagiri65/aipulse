/**
 * /api/panels/producthunt — read endpoint for the Launches panel.
 *
 * Returns the day's top launches in Product Hunt's "Artificial
 * Intelligence" topic (PH API v2, developer token in PRODUCT_HUNT_TOKEN).
 * Public read — every row cites its public PH launch page, nothing
 * operator-only. Empty (graceful) when the token is unset or the call
 * fails, so the panel renders an honest empty state rather than erroring.
 *
 * Cache: public s-maxage=600 / SWR=300. PH developer tokens are
 * rate-limited, so a 10-minute edge cache keeps us well clear of limits
 * while staying fresh enough for a launches list.
 */

import { NextResponse } from "next/server";
import {
  fetchProductHuntLaunches,
  type ProductHuntResult,
} from "@/lib/data/fetch-producthunt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<ProductHuntResult>> {
  const data = await fetchProductHuntLaunches();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300",
    },
  });
}
