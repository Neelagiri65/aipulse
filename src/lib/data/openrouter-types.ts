/**
 * Types for the OpenRouter Model Usage panel (S38).
 *
 * Two upstream shapes feed in:
 *   - Frontend rankings: /api/frontend/models/find?order=top-weekly
 *     (undocumented, may break — degrades to catalogue fallback).
 *   - Public catalogue: /api/v1/models (documented, no ranking signal).
 *
 * Both are normalised into ModelUsageRow; the DTO carries an
 * `ordering` discriminator so the UI knows whether it has the real
 * spend ranking or the catalogue-by-release-recency fallback.
 *
 * The frontend response carries a lot of fields we deliberately drop
 * (default_parameters, default_stops, supports_reasoning's nested
 * config, instruct_type, model_version_group_id, ...). We keep only
 * what the panel renders + what feeds the daily snapshot for history.
 */

export type ModelUsageOrdering =
  | "top-weekly"
  | "trending"
  | "catalogue-fallback";

export type ModelPricing = {
  /** Dollars per 1M prompt tokens. Null when source has no value. */
  promptPerMTok: number | null;
  /** Dollars per 1M completion tokens. Null when source has no value. */
  completionPerMTok: number | null;
  /** Dollars per web-search call where the model supports it. Null otherwise. */
  webSearchPerCall: number | null;
};

export type ModelUsageRow = {
  /** 1-indexed within the active ordering. */
  rank: number;
  /**
   * 1-indexed rank in the previous-day snapshot (the cron's
   * day-before-today fixed-time capture). Null when:
   *   - no previous snapshot is on file (cold start, fewer than 1
   *     full UTC day since first cron),
   *   - the slug was not in the previous snapshot's top-N (i.e. it
   *     entered the visible list since yesterday — render as "NEW"),
   *   - the active ordering is catalogue-fallback (rank deltas don't
   *     mean anything when the list isn't a popularity ranking).
   */
  previousRank: number | null;
  /** OpenRouter slug, e.g. "anthropic/claude-sonnet-4.6". Stable id. */
  slug: string;
  /** OpenRouter permaslug, version-pinned id. */
  permaslug: string;
  name: string;
  shortName: string;
  /** Author handle, e.g. "anthropic". Used for the major-lab allowlist check. */
  author: string;
  /** Author display name, e.g. "Anthropic". */
  authorDisplay: string;
  pricing: ModelPricing;
  /** Context length in tokens. */
  contextLength: number;
  /** ISO date the model's training data was cut. Null when source is null/missing. */
  knowledgeCutoff: string | null;
  supportsReasoning: boolean;
  modalitiesIn: string[];
  modalitiesOut: string[];
  /** Canonical OpenRouter model page. */
  hubUrl: string;
};

export type ModelUsageDto = {
  /** Which ordering this list represents. Drives the UI's labelling. */
  ordering: ModelUsageOrdering;
  /** ISO timestamp of when the DTO was assembled. */
  generatedAt: string;
  /**
   * ISO timestamp of when the upstream payload was fetched. Differs
   * from generatedAt when an old data file is being re-served from
   * disk by the panel API.
   */
  fetchedAt: string;
  rows: ModelUsageRow[];
  /**
   * True when the trending ordering's top-10 has ≥3 different slugs
   * vs top-weekly's top-10. Drives whether the panel's secondary
   * trending toggle is reachable. False when only one ordering was
   * fetched, when fallback is in use, or when overlap is high.
   */
  trendingDiffersFromTopWeekly: boolean;
  /** Empty array means sanity-clean. Otherwise short human-readable strings. */
  sanityWarnings: string[];
  /** The canonical user-facing caveat string for the panel header + drawer + digest. */
  sourceCaveat: string;
};

/**
 * Daily snapshot row appended to data/openrouter-snapshots.jsonl.
 * One JSONL line per UTC day, captured at the first cron fire after
 * 00:00 UTC. Top-N slugs only (configurable, default 50) — the panel
 * never reads back beyond the top of the list, and bounding the
 * snapshot keeps the file size manageable over months.
 */
export type ModelUsageSnapshotRow = {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  /** Ordering used for this snapshot — typically "top-weekly". */
  ordering: ModelUsageOrdering;
  /**
   * Top-N slugs in rank order. Index 0 = rank 1. Used to compute
   * day-over-day rank deltas in the drawer sparkline + digest.
   */
  slugs: string[];
};

/**
 * Authors known to ship serious frontier or open-weight models. Used
 * by the sanity check on top-1 — a no-name author taking #1 is
 * surprising enough to warrant ops investigation before the panel
 * displays the value with full confidence.
 *
 * Exported so tests can assert it; do NOT re-export to UI code (the
 * allowlist is a sanity gate, not a curation list).
 */
export const MAJOR_LAB_AUTHORS = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "moonshotai",
  "meta-llama",
  "mistralai",
  "qwen",
  "xai",
  "cohere",
  "alibaba",
  "microsoft",
  "nvidia",
  "perplexity",
  "amazon",
] as const;

export type MajorLabAuthor = (typeof MAJOR_LAB_AUTHORS)[number];

/**
 * The fixed user-facing caveat for the OpenRouter Model Usage panel.
 * Lives here so the panel header, drawer copy, and digest section all
 * cite the same string. Per S37 trust-bar #4, every number must say
 * what it does and does not mean inline.
 */
export const OPENROUTER_SOURCE_CAVEAT =
  "OpenRouter request volume reflects developer API spending, not end-user adoption. Biased toward API-first workflows that route through OpenRouter — direct OpenAI / Anthropic / Google customers who never use OpenRouter are invisible.";
