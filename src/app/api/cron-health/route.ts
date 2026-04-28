/**
 * Cron health read endpoint — JSON summary of every monitored cron's
 * last known state, consumed by the StatusBar chip and available for
 * direct inspection.
 *
 * Response shape (PUBLIC, intentionally minimal):
 *   {
 *     total: number,      // count of monitored workflows
 *     healthy: number,    // count with a recent success
 *     stale: number,      // total - healthy
 *     crons: Array<{ workflow, stale, lastSuccessAt, itemsProcessed }>,
 *     generatedAt: string,
 *   }
 *
 * No auth: this URL is curlable from anywhere on the internet. Per-cron
 * detail (lastError, lastFailureAt, errorCount, expectedIntervalMinutes,
 * updatedAt) is intentionally NOT here — those fields can hand attackers
 * a recon channel into env-var names + dependency state. They live at
 * /admin/cron-health behind the same Basic-Auth gate as /admin/digest.
 */

import { NextResponse } from "next/server";
import {
  readAllCronHealth,
  isCronStale,
  type CronHealthRecord,
} from "@/lib/data/cron-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PublicCronEntry = {
  workflow: CronHealthRecord["workflow"];
  stale: boolean;
  lastSuccessAt: string | null;
  itemsProcessed: number;
};

function toPublicEntry(r: CronHealthRecord, now: number): PublicCronEntry {
  return {
    workflow: r.workflow,
    stale: isCronStale(r, now),
    lastSuccessAt: r.lastSuccessAt,
    itemsProcessed: r.itemsProcessed,
  };
}

export async function GET() {
  const now = Date.now();
  const records = await readAllCronHealth();
  const crons = records.map((r) => toPublicEntry(r, now));
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
