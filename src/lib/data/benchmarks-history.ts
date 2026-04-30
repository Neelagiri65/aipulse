/**
 * Gawk — Per-row Elo history for the Benchmarks panel sparkline.
 *
 * Reads the most-recent N daily snapshots and projects them to a
 * per-modelName array of Elo values, oldest → newest, with `null` for
 * any day the model wasn't in the captured top-N. Pure function over
 * snapshots — IO is up to the caller (so this stays unit-testable).
 *
 * Trust contract:
 *  - Models that weren't captured on a given day surface as `null`. The
 *    SparklineMini renders `null` as a break in the line, never an
 *    interpolated value. A line with gaps is honest; a smooth interpolated
 *    line through missing days would be a fabrication.
 *  - Reads `rows` (top 20) when present; falls back to `top3` for
 *    snapshots predating the S48g schema widening. Without that fallback,
 *    historical sparklines would start blank for ~14 days while new
 *    snapshots accumulate.
 *  - Emits no synthetic values. If a model never appears in the window,
 *    its entry is an array of all-null — the panel decides whether to
 *    render an empty SVG or skip the cell.
 */

import { readRecentSnapshots, type DailySnapshot } from "@/lib/data/snapshot";

export type EloHistoryPoint = number | null;

/** Map from `modelName` to a window of Elo values, oldest → newest.
 *  Length equals the number of snapshots returned. */
export type EloHistoryByModel = Map<string, EloHistoryPoint[]>;

export type EloHistoryResult = {
  /** Snapshot dates in oldest → newest order. */
  dates: string[];
  byModel: EloHistoryByModel;
};

/**
 * Project an oldest→newest array of snapshots into per-model Elo history.
 * Pure — pass any array of snapshots to make it test-friendly.
 */
export function projectEloHistory(
  snapshotsOldestFirst: DailySnapshot[],
): EloHistoryResult {
  const dates = snapshotsOldestFirst.map((s) => s.date);
  const byModel: EloHistoryByModel = new Map();

  // Discover the universe of model names seen anywhere in the window.
  for (const snap of snapshotsOldestFirst) {
    const rows = snap.benchmarks?.rows ?? snap.benchmarks?.top3 ?? [];
    for (const row of rows) {
      if (!byModel.has(row.modelName)) {
        byModel.set(row.modelName, new Array(dates.length).fill(null));
      }
    }
  }

  // Fill in each day's entry by name lookup. Models absent from a
  // snapshot stay null (already initialised above).
  for (let i = 0; i < snapshotsOldestFirst.length; i++) {
    const snap = snapshotsOldestFirst[i];
    const rows = snap.benchmarks?.rows ?? snap.benchmarks?.top3 ?? [];
    for (const row of rows) {
      const arr = byModel.get(row.modelName);
      if (arr) arr[i] = row.rating;
    }
  }

  return { dates, byModel };
}

/**
 * Read the last `limit` snapshots and project them. Returns `dates` in
 * oldest→newest order so a sparkline reads left-to-right as time-forward.
 */
export async function readEloHistory(
  limit: number = 14,
): Promise<EloHistoryResult> {
  const recent = await readRecentSnapshots(limit);
  // readRecentSnapshots returns newest-first. Reverse to oldest-first
  // so the sparkline X-axis reads time-forward.
  const oldestFirst = recent.slice().reverse();
  return projectEloHistory(oldestFirst);
}
