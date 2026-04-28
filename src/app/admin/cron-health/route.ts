/**
 * Admin-only cron health endpoint — full per-workflow detail including
 * `lastError`, `lastFailureAt`, `errorCount`, `expectedIntervalMinutes`,
 * and `updatedAt`. The public sibling at `/api/cron-health` strips
 * those fields to keep env-var names + failure detail out of an
 * unauthenticated recon channel.
 *
 * Auth: middleware (`src/middleware.ts`) gates every `/admin/*` path
 * with HTTP Basic Auth via `ADMIN_PREVIEW_USER` + `ADMIN_PREVIEW_PASS`,
 * the same env-pair that gates `/admin/digest/preview` and
 * `/admin/subscribers`. This route inherits that gate — no extra
 * handler-level check is needed (or correct: a second check would
 * differ subtly from middleware and cause confusion).
 *
 * Same shape as the previous public response prior to the trim, so
 * any internal tooling that relied on the wider shape can swap the
 * URL and the credentials in.
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
