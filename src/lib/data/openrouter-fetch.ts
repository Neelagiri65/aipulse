/**
 * Fetch layer for the OpenRouter Model Usage panel.
 *
 * Strategy (per PRD AC #11): primary path is the undocumented
 * `/api/frontend/models/find?order={ordering}` endpoint. If that
 * returns 4xx, 5xx, network error, an empty models array, or a
 * response shape missing the `data.models` key, fall back to the
 * documented `/api/v1/models` catalogue. The catalogue carries no
 * ranking signal but lets the panel render *something* honest while
 * the upstream is broken.
 *
 * Secondary frontend fetches (e.g. trending alongside top-weekly)
 * are best-effort: a failure on the secondary leaves the primary
 * intact and surfaces `secondaryErrored`. That means a panel built
 * on top-weekly stays alive even if trending gets pulled.
 *
 * The fetcher dependency is injectable so the cron-route + assembler
 * tests can run hermetically without hitting openrouter.ai.
 */

import type {
  RawCatalogueResponse,
  RawFrontendResponse,
} from "@/lib/data/openrouter-rankings";
import type { ModelUsageOrdering } from "@/lib/data/openrouter-types";

export const OPENROUTER_FRONTEND_URL =
  "https://openrouter.ai/api/frontend/models/find";
export const OPENROUTER_V1_URL = "https://openrouter.ai/api/v1/models";

export type Fetcher = typeof fetch;

export type FetchOpenRouterRankingsInput = {
  /** Ordering to fetch as the primary list. */
  primaryOrdering: Extract<ModelUsageOrdering, "top-weekly" | "trending">;
  /**
   * Optional second ordering to fetch alongside the primary. Used to
   * power the "trending vs top-weekly differ" toggle gate. A failure
   * here is non-fatal.
   */
  secondaryOrdering?: Extract<ModelUsageOrdering, "top-weekly" | "trending">;
  /** Defaults to globalThis.fetch. Inject in tests. */
  fetcher?: Fetcher;
  /** Optional AbortSignal — propagated to every underlying fetch. */
  signal?: AbortSignal;
};

export type FetchOpenRouterRankingsResult = {
  /** Primary ordering response. Null when the primary fetch failed. */
  primary: RawFrontendResponse;
  /** Secondary ordering response. Null when not requested or when its fetch failed. */
  secondary: RawFrontendResponse;
  /**
   * Catalogue fallback response, populated only when the primary
   * fetch failed (HTTP error, network error, empty models, wrong
   * shape). Stays null on the happy path.
   */
  catalogue: RawCatalogueResponse;
  /** True when the primary fetch failed and the catalogue path was used. */
  frontendErrored: boolean;
  /**
   * True when the secondary fetch was requested but failed. Non-fatal —
   * the assembler treats a missing secondary the same as one not
   * requested. Surfaced so cron-health can flag partial-degradation.
   */
  secondaryErrored: boolean;
  /** ISO timestamp when this fetch round completed. */
  fetchedAt: string;
};

export async function fetchOpenRouterRankings(
  input: FetchOpenRouterRankingsInput,
): Promise<FetchOpenRouterRankingsResult> {
  const fetcher = input.fetcher ?? globalThis.fetch;
  const signal = input.signal;

  const primary = await fetchFrontend(input.primaryOrdering, fetcher, signal);
  const secondaryRequested = input.secondaryOrdering !== undefined;
  const secondary = secondaryRequested
    ? await fetchFrontend(input.secondaryOrdering!, fetcher, signal)
    : null;

  const primaryOk = isFrontendUsable(primary);
  const secondaryOk = secondaryRequested && isFrontendUsable(secondary);

  let catalogue: RawCatalogueResponse = null;
  if (!primaryOk) {
    catalogue = await fetchCatalogue(fetcher, signal);
  }

  return {
    primary: primaryOk ? primary : null,
    secondary: secondaryOk ? secondary : null,
    catalogue,
    frontendErrored: !primaryOk,
    secondaryErrored: secondaryRequested && !secondaryOk,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchFrontend(
  ordering: "top-weekly" | "trending",
  fetcher: Fetcher,
  signal: AbortSignal | undefined,
): Promise<RawFrontendResponse> {
  const url = `${OPENROUTER_FRONTEND_URL}?order=${ordering}`;
  try {
    const res = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return coerceFrontendShape(json);
  } catch {
    return null;
  }
}

async function fetchCatalogue(
  fetcher: Fetcher,
  signal: AbortSignal | undefined,
): Promise<RawCatalogueResponse> {
  try {
    const res = await fetcher(OPENROUTER_V1_URL, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return coerceCatalogueShape(json);
  } catch {
    return null;
  }
}

function coerceFrontendShape(raw: unknown): RawFrontendResponse {
  if (!raw || typeof raw !== "object") return null;
  const data = (raw as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const models = (data as { models?: unknown }).models;
  if (!Array.isArray(models)) return null;
  return raw as RawFrontendResponse;
}

function coerceCatalogueShape(raw: unknown): RawCatalogueResponse {
  if (!raw || typeof raw !== "object") return null;
  const data = (raw as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  return raw as RawCatalogueResponse;
}

/**
 * "Usable" = response present + has at least one model. The empty-
 * models case is treated as a soft failure because the assembler
 * can't surface a ranking from zero rows; we'd rather show the
 * catalogue (with the inline banner explaining why) than a blank
 * panel.
 */
function isFrontendUsable(raw: RawFrontendResponse): boolean {
  if (!raw || !raw.data || !Array.isArray(raw.data.models)) return false;
  return raw.data.models.length > 0;
}
