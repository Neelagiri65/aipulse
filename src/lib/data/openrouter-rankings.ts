/**
 * Pure DTO assembler for the OpenRouter Model Usage panel.
 *
 * Inputs: a frontend payload (the undocumented ranking endpoint),
 * an optional second ordering for the trending toggle, and an
 * optional catalogue payload used as a backstop when the frontend
 * endpoint went bad.
 *
 * Output: a `ModelUsageDto` ready for the panel API to ship.
 *
 * Hermetic: same input → same output. Pass `now` to make
 * `generatedAt` deterministic in tests.
 */

import {
  type ModelPricing,
  type ModelUsageDto,
  type ModelUsageOrdering,
  type ModelUsageRow,
  MAJOR_LAB_AUTHORS,
  OPENROUTER_SOURCE_CAVEAT,
} from "@/lib/data/openrouter-types";

/**
 * Subset of the OpenRouter frontend `models` array fields we read.
 * Anything we don't read is left untyped (`unknown`) so changes in
 * fields we don't depend on don't trip the assembler.
 */
export type RawFrontendModel = {
  slug: string;
  permaslug?: string;
  name?: string;
  short_name?: string;
  author?: string;
  author_display_name?: string;
  description?: string;
  context_length?: number;
  knowledge_cutoff?: string | null;
  supports_reasoning?: boolean;
  input_modalities?: string[];
  output_modalities?: string[];
  /**
   * Pricing in OpenRouter's native shape: USD per token (so 0.00003
   * means $30 per 1M prompt tokens). Returned as decimal strings.
   */
  endpoint?: {
    pricing?: {
      prompt?: string | number | null;
      completion?: string | number | null;
      web_search?: string | number | null;
    } | null;
  } | null;
  /**
   * Older response shape sometimes inlines pricing at top level.
   * The frontend endpoint usually nests it under `endpoint`; the
   * v1 catalogue inlines it. We accept both.
   */
  pricing?: {
    prompt?: string | number | null;
    completion?: string | number | null;
    web_search?: string | number | null;
  } | null;
  created?: number;
  created_at?: string;
};

export type RawFrontendResponse = {
  data?: { models?: RawFrontendModel[] } | null;
} | null;

export type RawCatalogueResponse = {
  data?: RawFrontendModel[] | null;
} | null;

export type AssembleModelUsageInput = {
  /** Primary ordering response (typically top-weekly). */
  primary: RawFrontendResponse;
  /** Optional secondary ordering response (typically trending). */
  secondary?: RawFrontendResponse;
  /** Catalogue fallback. Used only when both primary + secondary are degraded. */
  catalogue?: RawCatalogueResponse;
  /** True when the fetch layer chose the fallback path. */
  frontendErrored: boolean;
  /** Which ordering the primary response was fetched under. */
  primaryOrdering: ModelUsageOrdering;
  /**
   * Optional previous-day snapshot slugs (in rank order). When
   * provided, each row's `previousRank` is set from this list's
   * index. Slugs not present here render as "NEW". Pass [] or omit
   * for cold start / catalogue-fallback to suppress all rank-change
   * indicators.
   */
  previousSnapshotSlugs?: string[];
  /** Optional max rows to keep on the DTO. Default = 100. */
  limit?: number;
  /** Optional fixed clock for deterministic generatedAt in tests. */
  now?: () => Date;
  /** ISO timestamp the upstream fetch returned. Default = now(). */
  fetchedAt?: string;
};

const DEFAULT_LIMIT = 100;
const TOP_K_FOR_DIFF = 10;
const TOP_K_FOR_TURNOVER = 5;
const SANITY_MIN_MODELS = 100;
const SANITY_MAX_MODELS = 1500;

export function assembleModelUsage(input: AssembleModelUsageInput): ModelUsageDto {
  const now = input.now ? input.now() : new Date();
  const generatedAt = now.toISOString();
  const fetchedAt = input.fetchedAt ?? generatedAt;
  const limit = input.limit ?? DEFAULT_LIMIT;

  const primaryRaw = readFrontendModels(input.primary);
  const secondaryRaw = readFrontendModels(input.secondary ?? null);
  const catalogueRaw = readCatalogueModels(input.catalogue ?? null);

  const useFallback =
    input.frontendErrored ||
    primaryRaw.length === 0;

  const sourceModels = useFallback
    ? sortCatalogueByRecency(catalogueRaw)
    : primaryRaw;

  const ordering: ModelUsageOrdering = useFallback
    ? "catalogue-fallback"
    : input.primaryOrdering;

  // Map slug → rank for fast previous-rank lookup. Catalogue-fallback
  // never gets rank-change indicators because the list isn't a
  // popularity ranking (it's recency-sorted by `created_at`).
  const previousRankBySlug = useFallback
    ? new Map<string, number>()
    : buildPreviousRankIndex(input.previousSnapshotSlugs);

  const rows = sourceModels
    .slice(0, limit)
    .map((m, i) => normaliseRow(m, i + 1, previousRankBySlug));

  const sanityWarnings = computeSanityWarnings(rows, sourceModels.length);
  const trendingDiffersFromTopWeekly =
    !useFallback &&
    secondaryRaw.length > 0 &&
    differsByTopK(primaryRaw, secondaryRaw, TOP_K_FOR_DIFF);

  return {
    ordering,
    generatedAt,
    fetchedAt,
    rows,
    trendingDiffersFromTopWeekly,
    sanityWarnings,
    sourceCaveat: OPENROUTER_SOURCE_CAVEAT,
  };
}

function readFrontendModels(raw: RawFrontendResponse): RawFrontendModel[] {
  if (!raw || !raw.data || !Array.isArray(raw.data.models)) return [];
  return raw.data.models;
}

function readCatalogueModels(raw: RawCatalogueResponse): RawFrontendModel[] {
  if (!raw || !Array.isArray(raw.data)) return [];
  return raw.data;
}

/**
 * Catalogue-fallback ordering: most-recently-created first. Chosen
 * because it visibly differs from a popularity ranking (the user can
 * see the panel changed shape) without inventing a popularity signal
 * we don't have.
 */
function sortCatalogueByRecency(models: RawFrontendModel[]): RawFrontendModel[] {
  return [...models].sort((a, b) => {
    const aT = creationTimestamp(a);
    const bT = creationTimestamp(b);
    return bT - aT;
  });
}

function creationTimestamp(m: RawFrontendModel): number {
  if (typeof m.created === "number" && m.created > 0) return m.created;
  if (typeof m.created_at === "string") {
    const t = Date.parse(m.created_at);
    if (!Number.isNaN(t)) return t / 1000;
  }
  return 0;
}

function normaliseRow(
  m: RawFrontendModel,
  rank: number,
  previousRankBySlug: Map<string, number>,
): ModelUsageRow {
  const slug = m.slug;
  const author = m.author ?? slug.split("/")[0] ?? "unknown";
  const previousRank = previousRankBySlug.get(slug) ?? null;
  return {
    rank,
    previousRank,
    slug,
    permaslug: m.permaslug ?? slug,
    name: m.name ?? slug,
    shortName: m.short_name ?? m.name ?? slug,
    author,
    authorDisplay: m.author_display_name ?? author,
    pricing: parsePricing(m),
    contextLength: typeof m.context_length === "number" ? m.context_length : 0,
    knowledgeCutoff: m.knowledge_cutoff ?? null,
    supportsReasoning: Boolean(m.supports_reasoning),
    modalitiesIn: Array.isArray(m.input_modalities) ? m.input_modalities : [],
    modalitiesOut: Array.isArray(m.output_modalities) ? m.output_modalities : [],
    hubUrl: `https://openrouter.ai/${slug}`,
  };
}

function buildPreviousRankIndex(
  previousSnapshotSlugs: string[] | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!previousSnapshotSlugs) return out;
  for (let i = 0; i < previousSnapshotSlugs.length; i++) {
    // Only the first occurrence wins — defensive against malformed
    // upstream data that might duplicate a slug.
    const s = previousSnapshotSlugs[i];
    if (!out.has(s)) out.set(s, i + 1);
  }
  return out;
}

/**
 * Parses OpenRouter's per-token decimal-string pricing into dollars
 * per 1M tokens. Returns null for any field that's absent / null /
 * unparseable. Never returns 0 for a missing value — UI distinguishes
 * "free model" (real 0) from "unknown" (null) by checking for null.
 */
export function parsePricing(m: RawFrontendModel): ModelPricing {
  const src = m.endpoint?.pricing ?? m.pricing ?? null;
  if (!src) {
    return {
      promptPerMTok: null,
      completionPerMTok: null,
      webSearchPerCall: null,
    };
  }
  return {
    promptPerMTok: perTokenToPerMillion(src.prompt),
    completionPerMTok: perTokenToPerMillion(src.completion),
    webSearchPerCall: parseDollar(src.web_search),
  };
}

function perTokenToPerMillion(v: string | number | null | undefined): number | null {
  const n = parseDollar(v);
  return n === null ? null : Number((n * 1_000_000).toFixed(4));
}

function parseDollar(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function computeSanityWarnings(rows: ModelUsageRow[], totalSourceCount: number): string[] {
  const warnings: string[] = [];

  if (totalSourceCount < SANITY_MIN_MODELS) {
    warnings.push(
      `Model count ${totalSourceCount} below sanity floor of ${SANITY_MIN_MODELS}; upstream may be partial.`,
    );
  } else if (totalSourceCount > SANITY_MAX_MODELS) {
    warnings.push(
      `Model count ${totalSourceCount} above sanity ceiling of ${SANITY_MAX_MODELS}; investigate upstream changes.`,
    );
  }

  if (rows.length > 0) {
    const top = rows[0];
    if (
      !MAJOR_LAB_AUTHORS.includes(
        top.author as (typeof MAJOR_LAB_AUTHORS)[number],
      )
    ) {
      warnings.push(
        `Top-1 author "${top.author}" not in major-lab allowlist; investigate upstream before sharing.`,
      );
    }
  }

  return warnings;
}

/**
 * True when fewer than (TOP_K - cutoff) of the top-K slugs in `a`
 * appear anywhere in `b`'s top-K. Cutoff = K - 3, i.e. ≥3 slugs must
 * be different. The "anywhere in top-K" forgiveness handles slug
 * order shuffles within the top-10 as a non-difference (we want
 * different *models*, not different *positions*).
 */
function differsByTopK(
  a: RawFrontendModel[],
  b: RawFrontendModel[],
  k: number,
): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const aTop = a.slice(0, k).map((m) => m.slug);
  const bTop = new Set(b.slice(0, k).map((m) => m.slug));
  const overlap = aTop.filter((s) => bTop.has(s)).length;
  return aTop.length - overlap >= 3;
}

/**
 * Day-over-day top-K turnover, returning how many slugs from the
 * "today" top-K are missing from the "yesterday" top-K. Used by the
 * cron-route sanity check (>3 turnover/day flags an investigation).
 *
 * Exported so tests + the cron route can reuse the same shape.
 */
export function computeTopKTurnover(
  todaySlugs: string[],
  yesterdaySlugs: string[],
  k = TOP_K_FOR_TURNOVER,
): number {
  if (todaySlugs.length === 0 || yesterdaySlugs.length === 0) return 0;
  const todayTop = todaySlugs.slice(0, k);
  const yesterdayTop = new Set(yesterdaySlugs.slice(0, k));
  return todayTop.filter((s) => !yesterdayTop.has(s)).length;
}
