/**
 * Benchmarks digest section composer.
 *
 * Diffs today's vs yesterday's `snapshot.benchmarks.top3` to surface rank
 * shifts (model moved up/down), rating deltas, and new entrants. Cites
 * the LMArena leaderboard publish date.
 *
 * We only carry top-3 in the snapshot (capture decision in snapshot.ts),
 * so "fell out of the top 3" is rendered as "dropped from top 3" without
 * a new rank — the snapshot doesn't have rank 4+ to diff against.
 */

import type { SnapshotBenchmarks } from "@/lib/data/snapshot";
import type { DigestSection, DigestSectionItem } from "@/lib/digest/types";

const LMARENA_SOURCE = "https://lmarena.ai/leaderboard";

export type ComposeBenchmarksInput = {
  today: SnapshotBenchmarks | null;
  yesterday: SnapshotBenchmarks | null;
};

export function composeBenchmarksSection(
  input: ComposeBenchmarksInput,
): DigestSection {
  const { today, yesterday } = input;

  // No data at all — degrade gracefully.
  if (!today || today.top3.length === 0) {
    return {
      id: "benchmarks",
      title: "Benchmark movers",
      anchorSlug: "benchmarks",
      mode: "quiet",
      headline: "LMArena leaderboard data is unavailable right now",
      items: [],
      sourceUrls: [LMARENA_SOURCE],
    };
  }

  const isDiff = yesterday !== null && yesterday.top3.length > 0;
  const publishDateDetail = today.publishDate
    ? `LMArena · ${today.publishDate}`
    : "LMArena";

  if (!isDiff) {
    // Bootstrap: current top3.
    const items: DigestSectionItem[] = today.top3.map((row) => ({
      headline: `#${row.rank} ${row.modelName}`,
      detail: `${row.organization} · ${row.rating} Elo`,
      sourceLabel: "LMArena",
      sourceUrl: LMARENA_SOURCE,
    }));
    return {
      id: "benchmarks",
      title: "Benchmark movers",
      anchorSlug: "benchmarks",
      mode: "bootstrap",
      headline: "Current LMArena top 3",
      items,
      sourceUrls: [LMARENA_SOURCE],
    };
  }

  // Diff mode.
  const yestByName = new Map(
    yesterday!.top3.map((r) => [r.modelName, r]),
  );
  const movers: DigestSectionItem[] = [];
  for (const t of today.top3) {
    const y = yestByName.get(t.modelName);
    if (!y) {
      movers.push({
        headline: `New to top 3: ${t.modelName}`,
        detail: `#${t.rank} · ${t.organization} · ${t.rating} Elo`,
        sourceLabel: publishDateDetail,
        sourceUrl: LMARENA_SOURCE,
      });
      continue;
    }
    const rankDelta = y.rank - t.rank; // positive = moved up (lower rank number)
    const ratingDelta = t.rating - y.rating;
    if (rankDelta !== 0 || ratingDelta !== 0) {
      const parts: string[] = [];
      if (rankDelta > 0) parts.push(`up ${rankDelta} to #${t.rank}`);
      else if (rankDelta < 0) parts.push(`down ${-rankDelta} to #${t.rank}`);
      if (ratingDelta !== 0) {
        parts.push(
          `${ratingDelta > 0 ? "+" : ""}${ratingDelta} Elo (now ${t.rating})`,
        );
      }
      movers.push({
        headline: t.modelName,
        detail: `${parts.join(" · ")} · ${t.organization}`,
        sourceLabel: publishDateDetail,
        sourceUrl: LMARENA_SOURCE,
      });
    }
  }
  // Models that dropped out of today's top3 — present yesterday, absent today.
  const todayNames = new Set(today.top3.map((r) => r.modelName));
  for (const y of yesterday!.top3) {
    if (!todayNames.has(y.modelName)) {
      movers.push({
        headline: `Dropped from top 3: ${y.modelName}`,
        detail: `was #${y.rank} · ${y.organization}`,
        sourceLabel: publishDateDetail,
        sourceUrl: LMARENA_SOURCE,
      });
    }
  }

  if (movers.length === 0) {
    // Quiet: show current top-3 as tiles.
    const items: DigestSectionItem[] = today.top3.map((row) => ({
      headline: `#${row.rank} ${row.modelName}`,
      detail: `${row.organization} · ${row.rating} Elo`,
      sourceLabel: publishDateDetail,
      sourceUrl: LMARENA_SOURCE,
    }));
    return {
      id: "benchmarks",
      title: "Benchmark movers",
      anchorSlug: "benchmarks",
      mode: "quiet",
      headline: "No rank changes in the LMArena top 3",
      items,
      sourceUrls: [LMARENA_SOURCE],
    };
  }

  return {
    id: "benchmarks",
    title: "Benchmark movers",
    anchorSlug: "benchmarks",
    mode: "diff",
    headline: `${movers.length} change${movers.length === 1 ? "" : "s"} in the LMArena top 3`,
    items: movers,
    sourceUrls: [LMARENA_SOURCE],
  };
}
