/**
 * Board sparklines — derive per-domain time-series from the daily
 * snapshots, for the /board bento (v2).
 *
 * Pure and deterministic: each series is a straight projection of real
 * captured snapshot fields, never synthesised. A day whose source was
 * missing/null contributes `null` (SparklineMini renders a gap) rather
 * than a fabricated 0 — honest degradation, matching the trust contract.
 * Only domains that actually have a captured historical series get one;
 * feed-only domains (discussion/research/launches/releases) have no
 * snapshot history and intentionally get no sparkline.
 */

import type { DailySnapshot } from "@/lib/data/snapshot";

export type BoardSeries = {
  /** Top benchmark (LMArena) Elo rating per day. */
  models: Array<number | null>;
  /** Count of tools with zero active incidents per day. */
  tools: Array<number | null>;
  /** Sum of weekly downloads across all tracked packages per day. */
  packages: Array<number | null>;
  /** Sum of tracked-lab 24h activity per day. */
  labs: Array<number | null>;
};

export const EMPTY_BOARD_SERIES: BoardSeries = {
  models: [],
  tools: [],
  packages: [],
  labs: [],
};

export function deriveBoardSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): BoardSeries {
  // Chronological ascending so the sparkline reads left→right oldest→newest,
  // regardless of the store's return order.
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  const models = sorted.map((s) => s.benchmarks?.top3?.[0]?.rating ?? null);

  const tools = sorted.map((s) =>
    s.tools.length > 0
      ? s.tools.filter((t) => t.activeIncidents === 0).length
      : null,
  );

  const packages = sorted.map((s) => {
    if (!s.packages) return null;
    let sum = 0;
    let any = false;
    for (const entries of Object.values(s.packages)) {
      for (const p of entries) {
        if (typeof p.lastWeek === "number") {
          sum += p.lastWeek;
          any = true;
        }
      }
    }
    return any ? sum : null;
  });

  const labs = sorted.map((s) =>
    s.labs24h ? s.labs24h.reduce((acc, l) => acc + (l.total || 0), 0) : null,
  );

  return { models, tools, packages, labs };
}
