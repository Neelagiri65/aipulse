/**
 * Globe-events daily snapshot — writes a RegionalSnapshot blob keyed
 * by yesterday's UTC date with 30-day TTL. Powers the regional-deltas
 * read path's "compare current rolling-24h to N-days-ago" feature.
 *
 * Auth: shared INGEST_SECRET via the withIngest wrapper.
 *
 * Cadence: daily at 00:05 UTC via
 * `.github/workflows/globe-events-snapshot.yml`. The 5-minute buffer
 * past midnight ensures any events stamped through 23:59:59 UTC of
 * the previous day are included before the snapshot freezes.
 *
 * What it does:
 *   1. LRANGE the last 48h of events from globe-store.
 *   2. Filter to the previous-UTC-day window (yesterday 00:00 → today 00:00).
 *   3. Aggregate by country + city via aggregateByRegion.
 *   4. Write `aipulse:globe-events:snapshot:{YYYY-MM-DD}` keyed by
 *      yesterday's date. SETEX 30d.
 *
 * ok:true iff at least one event was aggregated. A whole-day-zero
 * outcome is honest (no live events for a day) but worth flagging in
 * cron-health so the operator can investigate; ok:false blocks the
 * write and preserves whatever was there before.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import {
  readWindow,
  writeRegionalSnapshot,
  type RegionalSnapshot,
  type StoredGlobePoint,
} from "@/lib/data/globe-store";
import { aggregateByRegion } from "@/lib/data/globe-aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type SnapshotIngestResult = {
  ok: boolean;
  /** YYYY-MM-DD (UTC) — the date the snapshot represents. */
  date: string;
  /** ISO of when the snapshot was written. */
  generatedAt: string;
  /** Number of events that contributed to the aggregate. */
  totalEvents: number;
  /** Number of those events whose country couldn't be resolved
   *  (coord outside every tracked bbox). */
  unattributedEvents: number;
};

export type SnapshotIngestOptions = {
  /** Override the read of recent events. Tests inject a fixed list. */
  readRecentEvents?: () => Promise<readonly StoredGlobePoint[]>;
  /** Override the snapshot write. Tests pass a spy. */
  writeSnapshot?: (s: RegionalSnapshot) => Promise<void>;
  now?: () => Date;
};

export async function runGlobeEventsSnapshot(
  opts: SnapshotIngestOptions = {},
): Promise<SnapshotIngestResult> {
  const now = opts.now ?? (() => new Date());
  const readRecent = opts.readRecentEvents ?? (async () => readWindow(48 * 60));
  const writeSnap = opts.writeSnapshot ?? writeRegionalSnapshot;

  const all = await readRecent();
  const t = now();
  const yesterday = previousUtcDate(t);
  // Window: events with eventAt in [yesterday 00:00, today 00:00).
  const todayStartMs = Date.UTC(
    t.getUTCFullYear(),
    t.getUTCMonth(),
    t.getUTCDate(),
  );
  const yesterdayStartMs = todayStartMs - 24 * 60 * 60 * 1000;
  const filtered = all.filter((p) => {
    const ts = Date.parse(p.eventAt);
    return Number.isFinite(ts) && ts >= yesterdayStartMs && ts < todayStartMs;
  });
  const agg = aggregateByRegion(filtered);

  const snapshot: RegionalSnapshot = {
    date: yesterday,
    generatedAt: t.toISOString(),
    totalEvents: agg.totalEvents,
    unattributedEvents: agg.unattributedEvents,
    byCountry: agg.byCountry,
    byCity: agg.byCity,
  };

  const ok = snapshot.totalEvents > 0;
  if (ok) await writeSnap(snapshot);

  return {
    ok,
    date: snapshot.date,
    generatedAt: snapshot.generatedAt,
    totalEvents: snapshot.totalEvents,
    unattributedEvents: snapshot.unattributedEvents,
  };
}

function previousUtcDate(now: Date): string {
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - 24 * 60 * 60 * 1000;
  const d = new Date(ms);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export const POST = withIngest({
  workflow: "globe-events-snapshot",
  run: async () => runGlobeEventsSnapshot(),
  toOutcome: (result) =>
    result.ok
      ? { ok: true, itemsProcessed: result.totalEvents }
      : {
          ok: false,
          error: `globe-events-snapshot ${result.date}: 0 events aggregated`,
        },
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;
