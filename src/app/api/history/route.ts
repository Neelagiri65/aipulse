/**
 * Historical snapshots read endpoint. Serves the most recent N daily
 * snapshots, newest first, for trend charting.
 *
 * Query params:
 *   - limit=<int>   1–365, default 30. Clamped by the snapshot module.
 *
 * Shape: { snapshots: DailySnapshot[], generatedAt: string }.
 * Empty array when Redis is unconfigured or when no snapshots have
 * been written yet — the caller should render "no history yet" rather
 * than treating absence as failure.
 *
 * No auth: historical snapshots contain only numbers that already
 * appear live on the dashboard; there's nothing to gate.
 */

import { NextResponse } from "next/server";
import { readRecentSnapshots } from "@/lib/data/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) || 30 : 30;
  const snapshots = await readRecentSnapshots(limit);
  return NextResponse.json({
    snapshots,
    generatedAt: new Date().toISOString(),
  });
}
