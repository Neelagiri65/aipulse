"use client";

/**
 * ModelUsagePanel — top-level panel for the OpenRouter Model Usage
 * surface. Composes ModelUsageList + RowDrawer + the toolbar caveat
 * strip + the trending deep-link toggle.
 *
 * The trending toggle, when present, deep-links to OpenRouter's own
 * `/rankings?order=trending` page rather than serving a separate
 * trending DTO. v1 deliberately avoids storing two ranking blobs;
 * the deep-link is honest ("we know they differ — go see the live
 * trending list at the source") and respects the trust contract.
 *
 * Tri-state surface:
 *   - data === null && isInitialLoading → "Loading…"
 *   - data === null && error           → error + Retry
 *   - data !== null but rows.length===0 → empty-state copy
 *   - data + rows                       → list + drawer
 */

import * as React from "react";
import { useState } from "react";

import { ModelUsageList } from "@/components/panels/model-usage/ModelUsageList";
import {
  RowDrawer,
  type RankHistoryPoint,
} from "@/components/panels/model-usage/RowDrawer";
import {
  OPENROUTER_SOURCE_CAVEAT,
  type ModelUsageDto,
} from "@/lib/data/openrouter-types";

const TRENDING_DEEP_LINK = "https://openrouter.ai/rankings?view=trending";

export type ModelUsagePanelProps = {
  data: ModelUsageDto | null;
  /** Polled-endpoint contract: string when last poll failed, null otherwise. */
  error: string | Error | null;
  isInitialLoading: boolean;
  originUrl: string;
  /** From `?focus=` on the standalone page; ignored if the slug is not in rows. */
  initialFocusedSlug?: string | null;
  /** Optional rank-history series keyed by slug, fed by the digest pre-compute. */
  rankHistoryBySlug?: Record<string, RankHistoryPoint[]>;
  /** Optional retry hook — defaults to window.location.reload(). */
  onRetry?: () => void;
};

export function ModelUsagePanel({
  data,
  error,
  isInitialLoading,
  originUrl,
  initialFocusedSlug,
  rankHistoryBySlug,
  onRetry,
}: ModelUsagePanelProps): React.ReactElement {
  const [focusedSlug, setFocusedSlug] = useState<string | null>(
    initialFocusedSlug ?? null,
  );

  if (!data && isInitialLoading) {
    return (
      <div
        className="model-usage-panel model-usage-loading"
        role="status"
        aria-label="Loading the latest OpenRouter ranking"
      >
        <div className="space-y-2 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 animate-pulse"
              aria-hidden
            >
              <div className="h-4 w-6 rounded bg-muted/60" />
              <div className="h-4 flex-1 rounded bg-muted/60" />
              <div className="h-4 w-16 rounded bg-muted/40" />
              <div className="h-4 w-12 rounded bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data && error) {
    const handleRetry = () => {
      if (onRetry) onRetry();
      else if (typeof window !== "undefined") window.location.reload();
    };
    return (
      <div className="model-usage-panel model-usage-error" role="alert">
        <p>Couldn&apos;t load the ranking — try again in a minute.</p>
        <button
          type="button"
          onClick={handleRetry}
          className="model-usage-retry"
          aria-label="Retry loading model usage data"
        >
          Retry now
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="model-usage-panel model-usage-empty" role="status">
        Collecting baseline. The first OpenRouter ranking writes within
        6 hours of deploy.
      </div>
    );
  }

  const fallbackBanner =
    data.ordering === "catalogue-fallback" ? (
      <p
        className="model-usage-fallback-banner"
        role="status"
        aria-label="Upstream ranking unavailable"
        title="OpenRouter's undocumented frontend endpoint changed shape. The list below is the documented model catalogue ordered by release recency. The cron retries every 6h."
      >
        Fallback: showing catalogue by recency. Rankings restore automatically.
      </p>
    ) : null;

  const trendingBanner =
    data.ordering !== "catalogue-fallback" && data.trendingDiffersFromTopWeekly ? (
      <p className="model-usage-trending-note">
        Trending differs from this week&apos;s spend ranking —{" "}
        <a
          href={TRENDING_DEEP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="model-usage-trending-link"
        >
          see OpenRouter trending ↗
        </a>
      </p>
    ) : null;

  const focusedRow =
    focusedSlug !== null
      ? data.rows.find((r) => r.slug === focusedSlug) ?? null
      : null;

  return (
    <div className="model-usage-panel" data-ordering={data.ordering}>
      {(fallbackBanner || trendingBanner) && (
        <header className="model-usage-header">
          {fallbackBanner}
          {trendingBanner}
        </header>
      )}
      <ModelUsageList
        data={data}
        focusedSlug={focusedSlug}
        onRowClick={(slug) => setFocusedSlug(slug)}
      />
      <footer
        className="model-usage-footer"
        title={OPENROUTER_SOURCE_CAVEAT}
      >
        <span aria-hidden="true" className="model-usage-footer-icon">ⓘ</span>
        <span>
          OpenRouter reflects API-first developer spend. Direct customers
          invisible.{" "}
          <a
            href="https://openrouter.ai/rankings"
            target="_blank"
            rel="noopener noreferrer"
            className="model-usage-footer-link"
          >
            Source ↗
          </a>
        </span>
      </footer>
      {focusedRow ? (
        <RowDrawer
          row={focusedRow}
          open={true}
          onClose={() => setFocusedSlug(null)}
          originUrl={originUrl}
          rankHistory={rankHistoryBySlug?.[focusedRow.slug]}
        />
      ) : null}
    </div>
  );
}

export default ModelUsagePanel;
