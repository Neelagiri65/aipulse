/**
 * AI Pulse — Quiet-day banner.
 *
 * Renders the locked banner copy + a minimal current-state summary
 * (top model, tool health green/total, latest paper). Used at the
 * top of the feed when no severity-≥40 cards landed in the last 24h.
 *
 * Honest fallback per CLAUDE.md: never fabricate cards on a quiet
 * day. The banner says exactly what is true ("28 sources tracked,
 * no significant moves today") and points to the still-current
 * state of the dashboard so the user has somewhere to look.
 */

import type { CurrentState } from "@/lib/feed/types";

export type QuietDayBannerProps = {
  currentState: CurrentState;
};

export function QuietDayBanner({ currentState }: QuietDayBannerProps) {
  const { topModel, toolHealth, latestPaper } = currentState;
  return (
    <section className="ap-feed-quiet-banner" role="status">
      <p className="ap-feed-quiet-banner-headline">
        All quiet — 28 sources tracked, no significant moves today.
      </p>
      <dl className="ap-feed-quiet-banner-state">
        <div className="ap-feed-quiet-banner-row">
          <dt>Top model</dt>
          <dd>
            <a href={topModel.sourceUrl} target="_blank" rel="noreferrer">
              {topModel.name}
            </a>
          </dd>
        </div>
        <div className="ap-feed-quiet-banner-row">
          <dt>Tool health</dt>
          <dd>
            {toolHealth.operational}/{toolHealth.total} operational
          </dd>
        </div>
        <div className="ap-feed-quiet-banner-row">
          <dt>Latest paper</dt>
          <dd>
            <a href={latestPaper.sourceUrl} target="_blank" rel="noreferrer">
              {latestPaper.title}
            </a>
          </dd>
        </div>
      </dl>
    </section>
  );
}
