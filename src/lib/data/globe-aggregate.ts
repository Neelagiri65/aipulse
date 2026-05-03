/**
 * Pure aggregator that turns a raw StoredGlobePoint list into a
 * RegionalSnapshot. Used by:
 *   - the daily snapshot writer (00:05 UTC cron) → persists yesterday
 *     into Redis with 30d TTL
 *   - the regional-deltas read path → builds the current 24h aggregate
 *     on the fly from the live 48h LRANGE
 *
 * Same input → same output. No I/O. The country/region per point comes
 * from `meta.country` / `meta.region` already stamped at ingest time
 * (S56 fetch-events change); this function does NOT re-run bbox lookups.
 *
 * Honesty: events without a `meta.country` count toward `totalEvents`
 * AND `unattributedEvents` but NOT toward `byCountry` — the country
 * aggregation is only true for the labelled subset. The dashboard
 * surfaces `unattributedEvents / totalEvents` so readers can see how
 * much of the volume is uncountable.
 */

import type { StoredGlobePoint } from "@/lib/data/globe-store";
import { cityFromCoords } from "@/lib/geocoding";

export type RegionalAggregate = {
  totalEvents: number;
  unattributedEvents: number;
  byCountry: Record<string, number>;
  byCity: Record<string, number>;
};

export function aggregateByRegion(
  points: readonly StoredGlobePoint[],
): RegionalAggregate {
  const byCountry: Record<string, number> = {};
  const byCity: Record<string, number> = {};
  let unattributed = 0;
  for (const p of points) {
    const country = (p.meta as { country?: string | null } | undefined)
      ?.country;
    if (country) {
      byCountry[country] = (byCountry[country] ?? 0) + 1;
    } else {
      unattributed++;
    }
    const city = cityFromCoords(p.lat, p.lng);
    if (city) byCity[city] = (byCity[city] ?? 0) + 1;
  }
  return {
    totalEvents: points.length,
    unattributedEvents: unattributed,
    byCountry,
    byCity,
  };
}

/**
 * Filter a point list to the rolling 24h window ending at `now` —
 * used by the regional-deltas read path to partition the 48h LRANGE
 * into "current 24h" without a separate Redis call.
 */
export function filterTo24hWindow(
  points: readonly StoredGlobePoint[],
  now: Date,
): StoredGlobePoint[] {
  const cutoffMs = now.getTime() - 24 * 60 * 60 * 1000;
  return points.filter((p) => {
    const t = Date.parse(p.eventAt);
    return Number.isFinite(t) && t >= cutoffMs;
  });
}
