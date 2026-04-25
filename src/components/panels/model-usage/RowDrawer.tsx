"use client";

/**
 * RowDrawer — drill-through for one OpenRouter model row.
 *
 * Surfaces what the dense list row can't fit:
 *   - Author chip + full model name + permaslug citation.
 *   - Deep-link to the OpenRouter model page (primary trust action —
 *     readers verify the number against the source themselves).
 *   - Pricing breakdown table: prompt / completion / web-search-per-call
 *     where present. Null fields render "not published" rather than "—"
 *     so the reader knows it's a source gap, not zero.
 *   - 30d rank-history sparkline. Hidden until the snapshots store has
 *     ≥2 entries for this slug — drawing one point is misleading.
 *   - SectionShareButton with `?focus={slug}` permalink that re-opens
 *     this drawer when followed.
 *
 * Behaviour mirrors the SDK Adoption drawer: open=false renders nothing,
 * ESC closes, backdrop click closes, role=dialog + aria-modal=true.
 */

import * as React from "react";
import { useCallback, useEffect } from "react";

import { SparklineMini } from "@/components/charts/SparklineMini";
import { SectionShareButton } from "@/components/digest/SectionShareButton";
import {
  formatContextLength,
  formatPricing,
} from "@/components/panels/model-usage/ModelUsageList";
import {
  OPENROUTER_SOURCE_CAVEAT,
  type ModelUsageRow,
} from "@/lib/data/openrouter-types";

export type RankHistoryPoint = {
  /** UTC date (YYYY-MM-DD). */
  date: string;
  /** 1-indexed rank on that date. Null when the slug fell out of the snapshot top-N. */
  rank: number | null;
};

export type RowDrawerProps = {
  row: ModelUsageRow;
  open: boolean;
  onClose: () => void;
  /** Origin used to compose the share permalink. e.g. "https://aipulse.dev". */
  originUrl: string;
  /**
   * Optional 30d rank history. When omitted or with fewer than 2
   * non-null entries, the sparkline section renders the empty-copy
   * fallback instead of a single-point line.
   */
  rankHistory?: RankHistoryPoint[];
};

export function composeShareHeadline(row: ModelUsageRow): string {
  const price = row.pricing.promptPerMTok;
  const priceCopy = price === null ? "" : ` · ${formatPricing(price)}/Mtok prompt`;
  return `${row.shortName} ranks #${row.rank} on OpenRouter (${row.authorDisplay})${priceCopy}`;
}

export function RowDrawer({
  row,
  open,
  onClose,
  originUrl,
  rankHistory,
}: RowDrawerProps): React.ReactElement | null {
  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, handleEsc]);

  if (!open) return null;

  const permalink = `${originUrl}/panels/model-usage?focus=${encodeURIComponent(row.slug)}`;
  const sectionTitle = `${row.shortName} (${row.authorDisplay})`;
  const headline = composeShareHeadline(row);
  const drawnHistory = (rankHistory ?? []).filter(
    (p) => p.rank !== null,
  ) as Array<{ date: string; rank: number }>;
  // Convert rank → "lower-is-better" sparkline; flip so higher
  // SparklineMini values mean better rank (rank 1 → top of chart).
  const sparkValues = drawnHistory.map((p) => -p.rank);
  const hasHistory = drawnHistory.length >= 2;

  return (
    <div className="row-drawer-backdrop" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={`mu-drawer-title-${row.slug}`}
        className="row-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <div className="drawer-title-row">
            <span
              className="registry-chip registry-chip-openrouter"
              title={`Author: ${row.authorDisplay}`}
            >
              {row.authorDisplay}
            </span>
            <h2 id={`mu-drawer-title-${row.slug}`} className="drawer-title">
              {row.name}
            </h2>
            <button
              type="button"
              className="drawer-close"
              aria-label="Close drawer"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div className="drawer-counter-meta">
            <a
              href={row.hubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="drawer-source-link"
            >
              View on OpenRouter ↗
            </a>
            <span aria-hidden="true"> · </span>
            <span>Rank #{row.rank}</span>
          </div>
        </header>

        <section className="drawer-stats" aria-label="Pricing and capabilities">
          <div className="stat">
            <span className="stat-label">Prompt / 1M</span>
            <span className="stat-value">
              {row.pricing.promptPerMTok === null
                ? "not published"
                : formatPricing(row.pricing.promptPerMTok)}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Completion / 1M</span>
            <span className="stat-value">
              {row.pricing.completionPerMTok === null
                ? "not published"
                : formatPricing(row.pricing.completionPerMTok)}
            </span>
          </div>
          {row.pricing.webSearchPerCall !== null ? (
            <div className="stat">
              <span className="stat-label">Web search / call</span>
              <span className="stat-value">
                {formatPricing(row.pricing.webSearchPerCall)}
              </span>
            </div>
          ) : null}
          <div className="stat">
            <span className="stat-label">Context</span>
            <span className="stat-value">
              {formatContextLength(row.contextLength)}
            </span>
          </div>
          {row.knowledgeCutoff ? (
            <div className="stat">
              <span className="stat-label">Knowledge cutoff</span>
              <span className="stat-value">{row.knowledgeCutoff}</span>
            </div>
          ) : null}
        </section>

        <section className="drawer-spark" aria-label="30-day rank history">
          {hasHistory ? (
            <SparklineMini
              data={sparkValues}
              width={320}
              height={56}
              label={`${row.shortName} OpenRouter rank, last ${drawnHistory.length} days`}
            />
          ) : (
            <p className="drawer-empty-history">
              Rank history will appear after the first 24h of snapshots.
            </p>
          )}
        </section>

        <section className="drawer-caveat" aria-label="Source caveat">
          <p>{OPENROUTER_SOURCE_CAVEAT}</p>
        </section>

        <footer className="drawer-share">
          <SectionShareButton
            sectionId={`model-usage-${row.slug}`}
            sectionTitle={sectionTitle}
            headline={headline}
            permalink={permalink}
          />
        </footer>
      </aside>
    </div>
  );
}
