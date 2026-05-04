/**
 * Genesis Report blocks — OpenRouter rank climbers + fallers over a
 * 30-day window.
 *
 * Both blocks share the same input shape (a `Record<date, snapshot>`
 * keyed by UTC date), the same window math (rank delta = oldRank -
 * newRank, positive = climbed), and the same row-format shape; only
 * the sort direction and the include-rule (positive vs negative
 * delta) differ. Kept in one module so the math + sources mapping
 * has a single source of truth — adding a third "movers" framing
 * later (e.g. "biggest absolute swings") slots in cleanly.
 *
 * Rank semantics:
 *   - Index 0 in `slugs[]` is rank 1 (best). Lower rank-number = better.
 *   - oldRank = indexOf(slug, oldSnapshot.slugs) + 1 (1-based for display)
 *   - newRank = indexOf(slug, newSnapshot.slugs) + 1
 *   - rankDelta = oldRank - newRank
 *     - Positive ⇒ climbed (good): "+ 6 ranks"
 *     - Negative ⇒ fell (bad):     "- 4 ranks"
 *
 * Slugs that appear in only ONE of the two snapshots (new entrants
 * or drop-outs) are EXCLUDED from both blocks — they're a different
 * editorial signal and would skew the ranking with effectively
 * infinite deltas. A future block can surface "new entrants" / "fell
 * out of top-N" as its own framing.
 *
 * Trust contract:
 *   - Per-row `sourceUrl` is `https://openrouter.ai/{slug}` — the
 *     canonical model page on OpenRouter (verified 200 on probe).
 *   - Verbatim `OPENROUTER_SOURCE_CAVEAT` travels on every row so
 *     the reader sees "API-first developer spend; direct customers
 *     invisible" in context, not buried in a methodology footer.
 *   - When < 2 snapshots exist (bootstrap window), returns rows: []
 *     with a sanity warning; honest empty, no fabricated ranks.
 *   - When the window edges have ≥ 2 snapshots but no slug appears
 *     in BOTH (a freak scenario), same honest empty.
 *
 * Pure: no IO, no clock reads (callers pass `now`).
 */

import {
  OPENROUTER_SOURCE_CAVEAT,
  type ModelUsageSnapshotRow,
} from "@/lib/data/openrouter-types";
import type { GenesisBlockResult, GenesisBlockRow } from "@/lib/reports/types";

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_TOP_N = 3;
const SOURCE_LABEL = "OpenRouter rankings";

export type OpenRouterMoversBlockInput = {
  /** All available snapshots, keyed by UTC date. The block picks the
   *  newest available + the closest snapshot ≤ windowDays old. */
  snapshots: Record<string, ModelUsageSnapshotRow>;
  windowDays?: number;
  topN?: number;
  now?: () => Date;
};

type RankMove = {
  slug: string;
  oldRank: number;
  newRank: number;
  rankDelta: number;
};

function pickWindowEdges(
  snapshots: Record<string, ModelUsageSnapshotRow>,
  windowDays: number,
  nowMs: number,
): { newSnap: ModelUsageSnapshotRow; oldSnap: ModelUsageSnapshotRow } | null {
  const dates = Object.keys(snapshots).sort();
  if (dates.length < 2) return null;
  const newSnap = snapshots[dates[dates.length - 1]];
  // Find the oldest snapshot whose age ≤ windowDays + 7 (small grace
  // for cron drift / weekend gaps). If nothing fits, take the oldest
  // available — bootstrap-friendly.
  const cutoffMs = nowMs - (windowDays + 7) * 24 * 60 * 60 * 1000;
  let oldSnap: ModelUsageSnapshotRow | null = null;
  for (const d of dates) {
    const t = Date.UTC(
      Number(d.slice(0, 4)),
      Number(d.slice(5, 7)) - 1,
      Number(d.slice(8, 10)),
    );
    if (t >= cutoffMs) {
      oldSnap = snapshots[d];
      break;
    }
  }
  if (!oldSnap) oldSnap = snapshots[dates[0]];
  if (oldSnap.date === newSnap.date) return null;
  return { newSnap, oldSnap };
}

function computeRankMoves(
  newSnap: ModelUsageSnapshotRow,
  oldSnap: ModelUsageSnapshotRow,
): RankMove[] {
  const oldIndex = new Map<string, number>();
  oldSnap.slugs.forEach((slug, i) => oldIndex.set(slug, i));
  const moves: RankMove[] = [];
  newSnap.slugs.forEach((slug, i) => {
    const oldIdx = oldIndex.get(slug);
    if (oldIdx === undefined) return; // new entrant — excluded
    const oldRank = oldIdx + 1;
    const newRank = i + 1;
    moves.push({ slug, oldRank, newRank, rankDelta: oldRank - newRank });
  });
  return moves;
}

function moveToRow(move: RankMove): GenesisBlockRow {
  const sign = move.rankDelta > 0 ? "↑" : "↓";
  const magnitude = Math.abs(move.rankDelta);
  return {
    label: move.slug,
    value: `Rank ${move.newRank}`,
    delta: `${sign} ${magnitude} ${magnitude === 1 ? "rank" : "ranks"}`,
    sourceUrl: `https://openrouter.ai/${move.slug}`,
    sourceLabel: SOURCE_LABEL,
    caveat: OPENROUTER_SOURCE_CAVEAT,
  };
}

export function loadOpenRouterClimbers30dBlock(
  input: OpenRouterMoversBlockInput,
): GenesisBlockResult {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const topN = input.topN ?? DEFAULT_TOP_N;
  const now = (input.now ?? (() => new Date()))();
  const edges = pickWindowEdges(input.snapshots, windowDays, now.getTime());
  if (!edges) {
    return {
      rows: [],
      generatedAt: now.toISOString(),
      sanityWarnings: [
        `OpenRouter snapshot history insufficient for a ${windowDays}-day rank-mover window (need ≥2 distinct dates).`,
      ],
    };
  }
  const moves = computeRankMoves(edges.newSnap, edges.oldSnap)
    .filter((m) => m.rankDelta > 0)
    .sort((a, b) => b.rankDelta - a.rankDelta)
    .slice(0, topN);
  return {
    rows: moves.map(moveToRow),
    generatedAt: now.toISOString(),
    sanityWarnings: [],
  };
}

export function loadOpenRouterFallers30dBlock(
  input: OpenRouterMoversBlockInput,
): GenesisBlockResult {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const topN = input.topN ?? DEFAULT_TOP_N;
  const now = (input.now ?? (() => new Date()))();
  const edges = pickWindowEdges(input.snapshots, windowDays, now.getTime());
  if (!edges) {
    return {
      rows: [],
      generatedAt: now.toISOString(),
      sanityWarnings: [
        `OpenRouter snapshot history insufficient for a ${windowDays}-day rank-mover window (need ≥2 distinct dates).`,
      ],
    };
  }
  const moves = computeRankMoves(edges.newSnap, edges.oldSnap)
    .filter((m) => m.rankDelta < 0)
    .sort((a, b) => a.rankDelta - b.rankDelta)
    .slice(0, topN);
  return {
    rows: moves.map(moveToRow),
    generatedAt: now.toISOString(),
    sanityWarnings: [],
  };
}

/**
 * Test-only export — exposes the pure helpers so block-level
 * regression tests can pin the math without round-tripping through
 * the full block loader.
 */
export const __test__ = { pickWindowEdges, computeRankMoves };
