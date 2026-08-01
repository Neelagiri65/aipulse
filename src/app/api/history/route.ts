/**
 * Historical snapshots read endpoint. Serves the most recent N daily
 * snapshots, newest first, for trend charting.
 *
 * Query params:
 *   - limit=<int>   1–365, default 30. Clamped by the snapshot module.
 *
 * Shape: { snapshots: DailySnapshot[], degraded: boolean, generatedAt }.
 * `degraded:false` + empty array means "no snapshots written yet" —
 * render "no history yet". `degraded:true` means the store could not
 * be read (unconfigured or the command was rejected) — render
 * "history temporarily unavailable", never "no history". The two were
 * previously indistinguishable, which let the 2026-07 Upstash
 * throttling incident masquerade as an honest empty state.
 *
 * The underlying read error is logged server-side only — this route is
 * public and unauthenticated, so infra details stay out of the body.
 *
 * No auth: historical snapshots contain only numbers that already
 * appear live on the dashboard; there's nothing to gate.
 */

import { NextResponse } from "next/server";
import { readRecentSnapshotsDetailed } from "@/lib/data/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) || 30 : 30;
  const result = await readRecentSnapshotsDetailed(limit);
  if (!result.ok) {
    console.error(`[history] snapshot read degraded: ${result.message}`);
  }
  return NextResponse.json({
    snapshots: result.snapshots,
    degraded: !result.ok,
    generatedAt: new Date().toISOString(),
  });
}
