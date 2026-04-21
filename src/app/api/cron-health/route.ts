/**
 * Cron health read endpoint — JSON summary of every monitored cron's
 * last known state, consumed by the StatusBar chip and available for
 * direct inspection.
 *
 * Response shape:
 *   {
 *     total: number,      // count of monitored workflows
 *     healthy: number,    // count with a recent success
 *     stale: number,      // total - healthy
 *     crons: Array<CronHealthRecord & { stale: boolean }>,
 *     generatedAt: string,
 *   }
 *
 * No auth: this is a read-only health summary, no secrets surfaced.
 */

import { NextResponse } from "next/server";
import {
  readAllCronHealth,
  isCronStale,
  type CronHealthRecord,
} from "@/lib/data/cron-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const now = Date.now();
  const records = await readAllCronHealth();
  const crons = records.map((r: CronHealthRecord) => ({
    ...r,
    stale: isCronStale(r, now),
  }));
  const total = crons.length;
  const stale = crons.filter((r) => r.stale).length;
  const healthy = total - stale;
  return NextResponse.json({
    total,
    healthy,
    stale,
    crons,
    generatedAt: new Date(now).toISOString(),
  });
}
