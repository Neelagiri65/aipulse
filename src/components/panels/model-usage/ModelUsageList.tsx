"use client";

/**
 * ModelUsageList — dense ranked list for the OpenRouter Model Usage
 * panel. Each row carries enough at-a-glance signal to make a decision
 * without opening the drawer:
 *
 *   - Rank (mono, padded) + top-3 row tint to draw the eye to leaders.
 *   - Provider colour dot (anthropic=teal, openai=green, google=blue,
 *     deepseek=orange, moonshot=yellow, meta=purple, …) — reuses the
 *     SDK Adoption registry-chip pattern at smaller scale.
 *   - Model short name + tooltip with full slug.
 *   - Author display name (compact).
 *   - **Rank-position bar** — horizontal bar whose width encodes
 *     (N - rank + 1) / N. The aria-label + title= explicitly say
 *     "rank position" not "spend": OpenRouter's public endpoint does
 *     not expose absolute usage numbers, so we never claim to.
 *   - Prompt $/1M tokens. Completion price is on hover (title=) and
 *     in full inside the drawer — keeps the row scannable.
 *
 * Click → emits onRowClick(slug) for the RowDrawer.
 *
 * Client-side sort buttons re-order without re-fetch:
 *   - rank          (default — preserves the upstream OpenRouter ordering)
 *   - price-asc     (cheap models first; null pricing sinks to bottom)
 *   - price-desc    (expensive first)
 *   - context-desc  (long-context first)
 */

import * as React from "react";

import type { ModelUsageDto, ModelUsageRow } from "@/lib/data/openrouter-types";
import { isOpenWeight } from "@/lib/data/open-weight";

export type ModelUsageSortOption =
  | "rank"
  | "price-asc"
  | "price-desc"
  | "context-desc";

const SORT_LABEL: Record<ModelUsageSortOption, string> = {
  rank: "Rank",
  "price-asc": "Cheapest",
  "price-desc": "Premium",
  "context-desc": "Long context",
};

const SORT_ORDER: ModelUsageSortOption[] = [
  "rank",
  "price-asc",
  "price-desc",
  "context-desc",
];

const TOP_HIGHLIGHT_RANKS = 3;

/**
 * Provider author → CSS-modifier slug for the colour dot. Lower-cased
 * lookup so "Anthropic" / "anthropic" both resolve. Anything not in the
 * map renders the neutral fallback dot (still visually present, just
 * grey) — never invents a colour for an unknown vendor.
 */
const PROVIDER_DOT_SLUG: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  "google-ai-studio": "google",
  deepseek: "deepseek",
  moonshotai: "moonshot",
  moonshot: "moonshot",
  "meta-llama": "meta",
  meta: "meta",
  mistralai: "mistral",
  mistral: "mistral",
  qwen: "qwen",
  alibaba: "qwen",
  xai: "xai",
  cohere: "cohere",
  microsoft: "microsoft",
  nvidia: "nvidia",
  perplexity: "perplexity",
  amazon: "amazon",
};

export type ModelUsageListProps = {
  data: ModelUsageDto;
  focusedSlug?: string | null;
  onRowClick?: (slug: string) => void;
  initialSort?: ModelUsageSortOption;
};

export function ModelUsageList({
  data,
  focusedSlug,
  onRowClick,
  initialSort = "rank",
}: ModelUsageListProps): React.ReactElement {
  const [sort, setSort] = React.useState<ModelUsageSortOption>(initialSort);

  if (data.rows.length === 0) {
    return (
      <div className="model-usage-empty" role="status">
        Collecting baseline. Rankings appear after the first OpenRouter cron fire (within 6 hours of deploy).
      </div>
    );
  }

  const sorted = React.useMemo(
    () => sortRows(data.rows, sort),
    [data.rows, sort],
  );

  // Rank bar normalisation uses the visible range of ranks present in
  // the trimmed DTO. With limit=30 we run from #1..#30; #1 = full bar,
  // #30 = sliver. Stays linear: simpler to read than log, and the
  // trimmed top-N already cuts the long tail.
  const maxRank = Math.max(...data.rows.map((r) => r.rank));

  return (
    <div className="model-usage">
      <div className="model-usage-sort" role="tablist" aria-label="Sort models">
        {SORT_ORDER.map((opt) => (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={sort === opt}
            className={`model-usage-sort-btn ${sort === opt ? "is-active" : ""}`}
            onClick={() => setSort(opt)}
          >
            {SORT_LABEL[opt]}
          </button>
        ))}
      </div>
      <div className="model-usage-header-row" aria-hidden="true">
        <span className="model-usage-rank">Rank</span>
        <span className="model-usage-label">Model</span>
        <span className="model-usage-author">Provider</span>
        <span className="model-usage-rank-bar-head">Position</span>
        <span className="model-usage-pricing">$/1M</span>
      </div>
      <ul className="model-usage-rows" role="list">
        {sorted.map((row) => {
          const focused = focusedSlug === row.slug;
          const top3 = row.rank <= TOP_HIGHLIGHT_RANKS;
          const providerSlug = providerDotSlug(row.author);
          const barFraction = computeRankBarFraction(row.rank, maxRank);
          const pricingTooltip =
            row.pricing.completionPerMTok !== null
              ? `Prompt ${formatPricing(row.pricing.promptPerMTok)} / 1M · completion ${formatPricing(row.pricing.completionPerMTok)} / 1M`
              : `Prompt ${formatPricing(row.pricing.promptPerMTok)} / 1M`;
          const classes = [
            "model-usage-row",
            top3 ? "row-top3" : "",
            focused ? "row-focused" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li
              key={row.slug}
              className={classes}
              data-slug={row.slug}
              onClick={onRowClick ? () => onRowClick(row.slug) : undefined}
            >
              <span className="model-usage-rank" aria-label={`Rank ${row.rank}`}>
                {String(row.rank).padStart(2, "0")}
                <RankChange row={row} ordering={data.ordering} />
              </span>
              <span className="model-usage-label">
                <span
                  className={`provider-dot provider-dot-${providerSlug}`}
                  aria-hidden="true"
                  title={row.authorDisplay}
                />
                <span className="model-usage-name" title={row.slug}>
                  {row.shortName}
                </span>
                {isOpenWeight(row.slug) && (
                  <span
                    className="model-usage-open-badge"
                    aria-label="Open-weight model"
                    title="Open-weight model — weights are publicly downloadable. Classification by slug-pattern (auditable in src/lib/data/open-weight.ts)."
                    data-testid="model-usage-open-badge"
                  >
                    OPEN
                  </span>
                )}
              </span>
              <span className="model-usage-author" aria-label={`Author ${row.authorDisplay}`}>
                {row.authorDisplay}
              </span>
              <span
                className="model-usage-rank-bar"
                aria-label={`Rank position ${row.rank} of ${maxRank} — bar shows position, not absolute spend`}
                title="Rank position — OpenRouter does not publish absolute spend numbers."
              >
                <span
                  className="model-usage-rank-bar-fill"
                  style={{ width: `${(barFraction * 100).toFixed(1)}%` }}
                />
              </span>
              <span
                className="model-usage-pricing"
                aria-label={`Pricing prompt ${formatPricing(row.pricing.promptPerMTok)} per 1M tokens`}
                title={pricingTooltip}
              >
                {formatPricing(row.pricing.promptPerMTok)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Sort a row list by the chosen option. Null pricing always sinks to
 * the bottom for both price-asc and price-desc — "unknown" should
 * not pretend to be free.
 */
export function sortRows(
  rows: ModelUsageRow[],
  sort: ModelUsageSortOption,
): ModelUsageRow[] {
  const copy = [...rows];
  switch (sort) {
    case "rank":
      copy.sort((a, b) => a.rank - b.rank);
      break;
    case "price-asc":
      copy.sort((a, b) => comparePricing(a, b, "asc"));
      break;
    case "price-desc":
      copy.sort((a, b) => comparePricing(a, b, "desc"));
      break;
    case "context-desc":
      copy.sort((a, b) => b.contextLength - a.contextLength);
      break;
  }
  return copy;
}

function comparePricing(
  a: ModelUsageRow,
  b: ModelUsageRow,
  direction: "asc" | "desc",
): number {
  const aPrice = a.pricing.promptPerMTok;
  const bPrice = b.pricing.promptPerMTok;
  // Null sinks to the bottom regardless of direction.
  if (aPrice === null && bPrice === null) return a.rank - b.rank;
  if (aPrice === null) return 1;
  if (bPrice === null) return -1;
  return direction === "asc" ? aPrice - bPrice : bPrice - aPrice;
}

export function formatPricing(perMTok: number | null): string {
  if (perMTok === null) return "—";
  if (perMTok === 0) return "free";
  if (perMTok < 1) return `$${perMTok.toFixed(2)}`;
  if (perMTok < 100) return `$${perMTok.toFixed(1)}`;
  return `$${Math.round(perMTok)}`;
}

export function formatContextLength(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K`;
  }
  return tokens.toString();
}

/**
 * Map a raw author string to the provider-dot CSS modifier slug. Falls
 * back to "neutral" for unknown vendors — never invents a colour for
 * an author we haven't curated.
 */
export function providerDotSlug(author: string): string {
  const key = author.toLowerCase();
  return PROVIDER_DOT_SLUG[key] ?? "neutral";
}

/**
 * Linear bar fraction from rank position. Rank 1 = full bar (1.0),
 * rank N = sliver (1/N). Returned in [0, 1] so the consumer can
 * percentage-format it directly.
 */
export function computeRankBarFraction(rank: number, maxRank: number): number {
  if (maxRank <= 1) return 1;
  if (rank < 1) return 1;
  if (rank > maxRank) return 1 / maxRank;
  return (maxRank - rank + 1) / maxRank;
}

export type RankChangeKind = "up" | "down" | "flat" | "new" | "hidden";

/**
 * Classify the day-over-day rank delta. catalogue-fallback always
 * returns "hidden" because the list isn't a popularity ranking and
 * deltas would be nonsense. Otherwise:
 *   - previousRank === null → new entrant
 *   - previousRank > rank   → climbed (up)
 *   - previousRank < rank   → declined (down)
 *   - previousRank === rank → unchanged (flat)
 */
export function classifyRankChange(
  rank: number,
  previousRank: number | null,
  ordering: ModelUsageDto["ordering"],
): RankChangeKind {
  if (ordering === "catalogue-fallback") return "hidden";
  if (previousRank === null) return "new";
  if (previousRank > rank) return "up";
  if (previousRank < rank) return "down";
  return "flat";
}

function RankChange({
  row,
  ordering,
}: {
  row: ModelUsageRow;
  ordering: ModelUsageDto["ordering"];
}): React.ReactElement | null {
  const kind = classifyRankChange(row.rank, row.previousRank, ordering);
  if (kind === "hidden") return null;
  if (kind === "new") {
    return (
      <span
        className="rank-change rank-change-new"
        aria-label="New entrant — was not in yesterday's top list"
        title="New entrant since yesterday's snapshot"
      >
        NEW
      </span>
    );
  }
  if (kind === "flat") {
    return (
      <span
        className="rank-change rank-change-flat"
        aria-label="Rank unchanged from yesterday"
        title="Same rank as yesterday's snapshot"
      >
        —
      </span>
    );
  }
  // up/down — previousRank is non-null at this point.
  const delta = Math.abs(row.rank - (row.previousRank ?? row.rank));
  const arrow = kind === "up" ? "▲" : "▼";
  const className =
    kind === "up" ? "rank-change rank-change-up" : "rank-change rank-change-down";
  const verb = kind === "up" ? "climbed" : "fell";
  return (
    <span
      className={className}
      aria-label={`Rank ${verb} ${delta} since yesterday`}
      title={`Was #${row.previousRank} yesterday`}
    >
      {arrow}
      {delta}
    </span>
  );
}
