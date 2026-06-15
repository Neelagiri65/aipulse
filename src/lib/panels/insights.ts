/**
 * Per-panel insight derivers — one deterministic, source-traced line per
 * dashboard panel, rendered under the panel titlebar (the `Win.insight`
 * slot, sibling to the `StatBar` counts row).
 *
 * Trust contract (CLAUDE.md non-negotiables):
 *   - Gawk aggregates, it does not score. Every line here is a pure
 *     aggregation/selection over the panel's own polled payload — no
 *     ranking is invented, no LLM is called, nothing is editorialised.
 *   - Every number traces to a public source. Each `PanelInsight` carries
 *     a `source` string naming the upstream + the window/period the claim
 *     is bounded to, so the line says what it does (and does not) cover.
 *   - Graceful degradation: a deriver returns `null` when its payload is
 *     missing/empty/error — the panel then renders no insight line rather
 *     than a fabricated one.
 *
 * All three derivers are pure: same input → same output, ties broken
 * deterministically.
 */

import type { GlobePoint } from "@/components/globe/Globe";
import type { ModelsResult } from "@/lib/data/fetch-models";
import type { BenchmarksPayload } from "@/lib/data/benchmarks-lmarena";
import {
  summariseClusterTypes,
  formatBreakdownLine,
  pickTopActiveCity,
} from "@/lib/map/insights";

/** A single panel insight: the sentence + its source trace. `null` from a
 *  deriver means "no honest line to show" (render nothing). */
export type PanelInsight = {
  /** The deterministic insight sentence. No trailing source — that lives
   *  in `source` so the UI can style it separately. */
  text: string;
  /** Source trace: upstream name + window/period the claim is bounded to.
   *  Always present so every number on screen is attributable. */
  source: string;
};

/** How many event-type buckets the wire breakdown shows before it gets
 *  noisy. Top 3 by count keeps the line readable. */
const WIRE_TYPE_CAP = 3;

/**
 * Wire panel (gh-events). Summarises the GitHub activity currently in the
 * feed window as a typed breakdown ("342 pushes · 88 PRs · 41 issues"),
 * optionally tagged with the busiest geocoded city.
 *
 * Honest scope: the breakdown covers the GH event points only (the same
 * stream the globe plots), bounded to the upstream window. HN stories that
 * also appear in the LiveFeed are not GH-typed and are excluded from the
 * count — the source line names "GitHub Events" so the claim is precise.
 *
 * Returns null when no live GH events are in the window.
 */
export function wireInsight(
  points: readonly GlobePoint[],
  windowMinutes: number,
): PanelInsight | null {
  const breakdown = summariseClusterTypes(points).slice(0, WIRE_TYPE_CAP);
  if (breakdown.length === 0) return null;

  let text = formatBreakdownLine(breakdown);
  const busiest = pickTopActiveCity(points);
  if (busiest) text += ` · busiest ${busiest.city}`;

  return { text, source: `GitHub Events · last ${windowMinutes}m` };
}

/**
 * Models panel (hf-downloads). Names the most-downloaded model in the
 * top-20 listing and how many distinct orgs are represented — pure
 * description of HuggingFace's own download ordering, no re-ranking.
 *
 * Returns null when the payload is missing, errored, or empty.
 */
export function modelsInsight(
  result: ModelsResult | undefined,
): PanelInsight | null {
  if (!result || !result.ok || result.models.length === 0) return null;

  // HF returns the listing already sorted by `downloads` desc; we mirror
  // that order verbatim (trust contract: no re-ranking). The leader is
  // therefore models[0].
  const leader = result.models[0];
  const orgs = new Set(
    result.models.map((m) => m.author).filter(Boolean),
  ).size;

  const text =
    `Most downloaded: ${leader.name} · ${compactCount(leader.downloads)} downloads/30d` +
    ` · ${orgs} ${orgs === 1 ? "org" : "orgs"} in top ${result.models.length}`;

  return { text, source: "HuggingFace · 30-day downloads" };
}

/**
 * Benchmarks panel (lmarena). Surfaces the largest rank climb since the
 * previous leaderboard snapshot; falls back to the #1 hold line when no
 * model moved up. Every figure (rank, delta, Elo) comes straight from the
 * committed payload.
 *
 * Returns null when the payload is not ok or has no rows.
 */
export function benchmarksInsight(
  payload: BenchmarksPayload | undefined,
): PanelInsight | null {
  if (!payload || !payload.ok || payload.rows.length === 0) return null;

  const { rows, meta } = payload;
  const period = meta.prevPublishDate
    ? `${meta.leaderboardPublishDate} vs ${meta.prevPublishDate}`
    : meta.leaderboardPublishDate;
  const source = `Chatbot Arena · ${period}`;

  // Biggest climber: largest rankDelta "up" amount. Ties broken by better
  // (lower) current rank, then model name — deterministic.
  let climber: { name: string; amount: number; rank: number } | null = null;
  for (const r of rows) {
    if (r.rankDelta.kind !== "up") continue;
    const cand = { name: r.modelName, amount: r.rankDelta.amount, rank: r.rank };
    if (
      !climber ||
      cand.amount > climber.amount ||
      (cand.amount === climber.amount && cand.rank < climber.rank) ||
      (cand.amount === climber.amount &&
        cand.rank === climber.rank &&
        cand.name < climber.name)
    ) {
      climber = cand;
    }
  }

  if (climber) {
    const ranks = climber.amount === 1 ? "rank" : "ranks";
    return {
      text: `Biggest climber: ${climber.name} ▲${climber.amount} ${ranks} to #${climber.rank}`,
      source,
    };
  }

  // No upward movement — describe the holder of #1 with its Elo.
  const leader = rows[0];
  return {
    text: `${leader.modelName} holds #${leader.rank} at ${Math.round(leader.rating)} Elo`,
    source,
  };
}

/**
 * Compact a non-negative integer count for inline display: 1234 → "1.2K",
 * 4_500_000 → "4.5M". Trailing ".0" is dropped. Values under 1000 render
 * verbatim. Deterministic; no locale dependence.
 */
export function compactCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 1e9) return `${trimDecimal(n / 1e9)}B`;
  if (n >= 1e6) return `${trimDecimal(n / 1e6)}M`;
  if (n >= 1e3) return `${trimDecimal(n / 1e3)}K`;
  return `${Math.round(n)}`;
}

function trimDecimal(x: number): string {
  const s = x.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}
