"use client";

/**
 * ModelUsageList — dense ranked list for the OpenRouter Model Usage
 * panel. Each row shows: rank, name + author chip, prompt+completion
 * pricing, context window. Click → emits onRowClick(slug) for the
 * RowDrawer.
 *
 * Client-side sort buttons re-order the same data without re-fetch:
 *   - rank          (default — preserves the upstream ordering)
 *   - price-asc     (cheap models first; null pricing sinks to bottom)
 *   - price-desc    (expensive first)
 *   - context-desc  (long-context first)
 *
 * Empty state when the DTO carries no rows. Stale fallback when the
 * stored DTO ordering is "catalogue-fallback" — the panel header
 * already shows the inline banner; here we just suppress sort options
 * that don't make sense (price-asc on a recency-sorted catalogue is
 * still meaningful, so we leave them on).
 */

import * as React from "react";

import type { ModelUsageDto, ModelUsageRow } from "@/lib/data/openrouter-types";

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
      <ul className="model-usage-rows" role="list">
        {sorted.map((row) => {
          const focused = focusedSlug === row.slug;
          const classes = ["model-usage-row", focused ? "row-focused" : ""]
            .filter(Boolean)
            .join(" ");
          return (
            <li
              key={row.slug}
              className={classes}
              data-slug={row.slug}
              onClick={onRowClick ? () => onRowClick(row.slug) : undefined}
            >
              <span className="model-usage-rank">
                {String(row.rank).padStart(2, "0")}
              </span>
              <span className="model-usage-label">
                <span className="model-usage-name">{row.shortName}</span>
                <span
                  className="model-usage-author"
                  title={`Author: ${row.authorDisplay}`}
                >
                  {row.authorDisplay}
                </span>
              </span>
              <span className="model-usage-pricing" aria-label="Pricing per million tokens">
                <span className="model-usage-pricing-prompt">
                  {formatPricing(row.pricing.promptPerMTok)}
                </span>
                <span className="model-usage-pricing-divider" aria-hidden="true">
                  /
                </span>
                <span className="model-usage-pricing-completion">
                  {formatPricing(row.pricing.completionPerMTok)}
                </span>
              </span>
              <span
                className="model-usage-context"
                aria-label={`Context window ${row.contextLength.toLocaleString()} tokens`}
              >
                {formatContextLength(row.contextLength)}
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
