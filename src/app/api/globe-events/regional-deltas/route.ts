/**
 * /api/globe-events/regional-deltas — read endpoint that compares the
 * current rolling 24h to the snapshot from N days ago, exposing the
 * country / city movement that drives TopMoversLine and the per-cluster
 * delta indicators.
 *
 * Reads:
 *   - `globe:events` LRANGE for the last 24h (current window)
 *   - `aipulse:globe-events:snapshot:{yesterday}` for the prior window
 *
 * Returns:
 *   { generatedAt, windowHours: 24,
 *     byCountry: { [country]: { current24h, prior24h, deltaPct } },
 *     topGrowingCountry, mostActiveCity }
 *
 * Honest-by-design:
 *   - `deltaPct` is null when prior24h was zero (avoid div-by-zero); the
 *     UI renders "+new" in that case.
 *   - `topGrowingCountry` is null when no country has both a positive
 *     current24h AND a non-zero prior24h with a meaningful delta.
 *   - `mostActiveCity` is null when no live event in the current 24h
 *     window has a recoverable city — never fabricated.
 *
 * Bootstrap window: until at least 1 daily snapshot has been written
 * (i.e. for the first 24h after this ships), `prior24h` is null for
 * every country and `topGrowingCountry` returns null. The dashboard
 * shows "Most active" but suppresses "Fastest growing" — honest.
 *
 * Cache: public s-maxage=300 / SWR=60 — matches the cadence of the
 * upstream snapshot writer.
 */

import { NextResponse } from "next/server";
import {
  readWindow,
  readRegionalSnapshot as readSnapshot,
  type StoredGlobePoint,
  type RegionalSnapshot,
} from "@/lib/data/globe-store";
import {
  aggregateByRegion,
  filterTo24hWindow,
  type RegionalAggregate,
} from "@/lib/data/globe-aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minimum prior-24h count for a delta to count as "fastest growing".
 *  Prevents tiny denominators from dominating the leaderboard
 *  (e.g. "country went from 1 → 3 events = +200%"). */
const MIN_PRIOR_FOR_GROWTH_RANKING = 5;

export type RegionalDelta = {
  current24h: number;
  prior24h: number | null;
  deltaPct: number | null;
};

export type RegionalDeltasDto = {
  generatedAt: string;
  windowHours: 24;
  byCountry: Record<string, RegionalDelta>;
  topGrowingCountry: { country: string; deltaPct: number } | null;
  mostActiveCity: { city: string; count: number } | null;
};

export type RegionalDeltasDeps = {
  readWindow: (mins: number) => Promise<readonly StoredGlobePoint[]>;
  readSnapshot: (date: string) => Promise<RegionalSnapshot | null>;
  now: () => Date;
};

const DEFAULT_DEPS: RegionalDeltasDeps = {
  readWindow: (mins) => readWindow(mins),
  readSnapshot,
  now: () => new Date(),
};

export async function handleGetRegionalDeltas(
  deps: RegionalDeltasDeps = DEFAULT_DEPS,
): Promise<{ dto: RegionalDeltasDto; cacheHeader: string }> {
  const t = deps.now();
  // Pull the full 48h LRANGE; we only need the last 24h for the
  // current aggregate, but doing this in one call beats two separate
  // round-trips for the prior window (which we read from the snapshot
  // blob anyway).
  const recent = await deps.readWindow(48 * 60);
  const current24h = filterTo24hWindow(recent, t);
  const currentAgg = aggregateByRegion(current24h);

  const yesterday = previousUtcDate(t);
  const priorSnapshot = await deps.readSnapshot(yesterday);
  const priorByCountry = priorSnapshot?.byCountry ?? null;

  const byCountry = buildByCountry(currentAgg, priorByCountry);
  const topGrowingCountry = pickTopGrowingCountry(byCountry);
  const mostActiveCity = pickMostActiveCity(currentAgg);

  return {
    dto: {
      generatedAt: t.toISOString(),
      windowHours: 24,
      byCountry,
      topGrowingCountry,
      mostActiveCity,
    },
    cacheHeader: "public, s-maxage=300, stale-while-revalidate=60",
  };
}

export async function GET() {
  const { dto, cacheHeader } = await handleGetRegionalDeltas();
  return NextResponse.json(dto, {
    headers: { "Cache-Control": cacheHeader },
  });
}

function buildByCountry(
  current: RegionalAggregate,
  priorByCountry: Record<string, number> | null,
): Record<string, RegionalDelta> {
  const out: Record<string, RegionalDelta> = {};
  // Union of countries seen in either window — a country that fell to
  // zero today is still listed (current24h=0, prior24h>0, deltaPct=-100).
  const countries = new Set<string>([
    ...Object.keys(current.byCountry),
    ...(priorByCountry ? Object.keys(priorByCountry) : []),
  ]);
  for (const country of countries) {
    const cur = current.byCountry[country] ?? 0;
    const prior = priorByCountry?.[country] ?? null;
    let deltaPct: number | null = null;
    if (prior !== null && prior > 0) {
      deltaPct = ((cur - prior) / prior) * 100;
    }
    out[country] = { current24h: cur, prior24h: prior, deltaPct };
  }
  return out;
}

function pickTopGrowingCountry(
  byCountry: Record<string, RegionalDelta>,
): { country: string; deltaPct: number } | null {
  let top: { country: string; deltaPct: number } | null = null;
  for (const [country, d] of Object.entries(byCountry)) {
    if (d.deltaPct === null) continue;
    if ((d.prior24h ?? 0) < MIN_PRIOR_FOR_GROWTH_RANKING) continue;
    if (d.current24h <= 0) continue; // a dead-today country is decline, not growth
    if (top === null || d.deltaPct > top.deltaPct) {
      top = { country, deltaPct: d.deltaPct };
    }
  }
  return top;
}

function pickMostActiveCity(
  current: RegionalAggregate,
): { city: string; count: number } | null {
  let top: { city: string; count: number } | null = null;
  for (const [city, count] of Object.entries(current.byCity)) {
    if (top === null || count > top.count || (count === top.count && city < top.city)) {
      top = { city, count };
    }
  }
  return top;
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
