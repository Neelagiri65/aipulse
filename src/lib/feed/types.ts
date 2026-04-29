/**
 * Gawk — Feed types
 *
 * Shape of a single card in the ranked feed and the API response.
 * The feed is a pure derivation over existing snapshots — every card
 * carries a primary-source URL read from `data-sources.ts`, never invented.
 *
 * Severity is a sort key over already-aggregated public data, never an
 * invented metric. The full formula lives in `thresholds.ts` and is
 * declared verbatim on `/methodology`. See `prd-feed.md` Part 5 for the
 * architectural-constraint test this design satisfies.
 */

export type CardType =
  | "TOOL_ALERT"
  | "MODEL_MOVER"
  | "NEW_RELEASE"
  | "SDK_TREND"
  | "NEWS"
  | "RESEARCH"
  | "LAB_HIGHLIGHT";

export type Severity = 100 | 80 | 70 | 60 | 40 | 20 | 10;

export type Card = {
  /** Stable hash of (type, primaryKey, hour-bucket). Used as the share-URL slug. */
  id: string;
  type: CardType;
  severity: Severity;
  /** Deterministic copy. No LLM. */
  headline: string;
  /** One-line context (e.g. "+5 ranks in 24h"). Optional. */
  detail?: string;
  /** Human-readable source name from `data-sources.ts` (e.g. "Anthropic Status"). */
  sourceName: string;
  /** Canonical public URL the underlying number was read from. Mandatory. */
  sourceUrl: string;
  /** ISO timestamp of the underlying event (not of the derive run). */
  timestamp: string;
  /** Type-specific structured fields. Kept as primitives so the response is JSON-safe. */
  meta: Record<string, string | number | boolean>;
};

export type CurrentState = {
  topModel: { name: string; sourceUrl: string };
  toolHealth: { operational: number; degraded: number; total: number };
  latestPaper: { title: string; sourceUrl: string };
};

/**
 * Per-source disclosure: when a live-fetch source failed and the loader
 * served the last successful payload from cache, the source name and
 * the cache-write timestamp travel with the response so the UI can show
 * "as of $time" honestly. Per the trust contract: a cited stale number
 * is more valuable than a blank panel.
 */
export type StaleSource = {
  source: string;
  /** ISO timestamp the cached payload was last successfully fetched. */
  staleAsOf: string;
};

export type FeedResponse = {
  cards: Card[];
  /** True when zero cards with severity ≥ 40 exist in the last 24h. */
  quietDay: boolean;
  /** Always populated. Used in the quiet-day banner; available to the UI regardless. */
  currentState: CurrentState;
  /** ISO timestamp of this derivation run. */
  lastComputed: string;
  /**
   * Sources whose data was served from last-known cache because the
   * fresh fetch failed. Omitted when every source returned fresh data.
   */
  staleSources?: StaleSource[];
};
