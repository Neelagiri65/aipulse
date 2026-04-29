/**
 * Gawk — Feed thresholds (LOCKED)
 *
 * Single source of truth for the severity formula and trigger thresholds.
 * The `/methodology` page imports from this file verbatim; any change to
 * a threshold is one git commit and is therefore auditable.
 *
 * Severity tiering is a deterministic sort key over already-aggregated
 * public data. It is NOT an invented metric. Gawk aggregates, it does
 * not score — see `prd-feed.md` Part 5.
 *
 * Decisions locked S40 2026-04-27.
 */

import type { CardType, Severity } from "@/lib/feed/types";

export const FEED_SEVERITIES: Readonly<Record<CardType, Severity>> =
  Object.freeze({
    TOOL_ALERT: 100,
    MODEL_MOVER: 80,
    NEW_RELEASE: 70,
    SDK_TREND: 60,
    NEWS: 40,
    RESEARCH: 20,
    LAB_HIGHLIGHT: 10,
  });

export const FEED_TRIGGERS = Object.freeze({
  /** A model fires MODEL_MOVER when |currentRank - previousRank| > this value. */
  MODEL_MOVER_RANK_DELTA: 3,
  /** A package fires SDK_TREND when |week-over-week download %| > this value. */
  SDK_TREND_WOW_PCT: 10,
  /** An HN story fires NEWS when its points exceed this AND it landed within the window. */
  NEWS_HN_POINTS: 100,
  NEWS_HN_WINDOW_HOURS: 6,
  /** A HuggingFace model fires NEW_RELEASE when createdAt is within this window. */
  NEW_RELEASE_AGE_HOURS: 48,
  /** Likes are first-paint social proof on HF — more reliable than rolling
   *  download counts on day 1 (the 30d `downloads` field starts at 0). */
  NEW_RELEASE_MIN_LIKES: 5,
});

export type FeedTriggers = typeof FEED_TRIGGERS;
