/**
 * Cron-side runner for the OpenRouter Model Usage panel.
 *
 * Composed of three pure stages:
 *   1. fetchOpenRouterRankings — hits frontend (top-weekly + trending)
 *      with v1 catalogue fallback.
 *   2. assembleModelUsage — turns raw responses into a typed DTO.
 *   3. write — persists the live DTO + appends today's snapshot if
 *      the date hasn't been captured yet.
 *
 * The caller (cron route) injects `fetchRankings` and `store` so the
 * test suite can drive deterministic behaviour without hitting Redis
 * or openrouter.ai. Returns a `RunResult` the route translates into a
 * cron-health outcome (frontend-degraded → ok:true with reason; thrown
 * errors propagate via withIngest's catch).
 */

import {
  assembleModelUsage,
  type RawCatalogueResponse,
  type RawFrontendResponse,
} from "@/lib/data/openrouter-rankings";
import {
  fetchOpenRouterRankings as defaultFetchOpenRouterRankings,
  type FetchOpenRouterRankingsResult,
} from "@/lib/data/openrouter-fetch";
import {
  redisOpenRouterStore,
  utcDate,
  type OpenRouterStore,
} from "@/lib/data/openrouter-store";
import type {
  ModelUsageDto,
  ModelUsageSnapshotRow,
} from "@/lib/data/openrouter-types";

export const SNAPSHOT_TOP_N = 50;

export type RunOpenRouterIngestInput = {
  fetchRankings?: () => Promise<FetchOpenRouterRankingsResult>;
  store?: OpenRouterStore;
  /** Defaults to new Date(). Tests pin this for deterministic UTC date. */
  now?: () => Date;
};

export type RunResult = {
  ok: boolean;
  ordering: ModelUsageDto["ordering"];
  rowsWritten: number;
  snapshotWritten: boolean;
  date: string;
  /** Set when the frontend-primary path failed and catalogue fallback was used. */
  reason?: "frontend-degraded";
  sanityWarnings: string[];
};

export async function runOpenRouterIngest(
  input: RunOpenRouterIngestInput = {},
): Promise<RunResult> {
  const fetchRankings = input.fetchRankings ?? (() =>
    defaultFetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      secondaryOrdering: "trending",
    }));
  const store = input.store ?? redisOpenRouterStore;
  const now = input.now ?? (() => new Date());

  const fetched = await fetchRankings();
  const dto = assembleModelUsage({
    primary: fetched.primary as RawFrontendResponse,
    secondary: fetched.secondary as RawFrontendResponse,
    catalogue: fetched.catalogue as RawCatalogueResponse,
    frontendErrored: fetched.frontendErrored,
    primaryOrdering: "top-weekly",
    fetchedAt: fetched.fetchedAt,
    now,
  });

  await store.writeRankingsLatest(dto);

  const date = utcDate(now());
  const snapshotRow: ModelUsageSnapshotRow = {
    date,
    ordering: dto.ordering,
    slugs: dto.rows.slice(0, SNAPSHOT_TOP_N).map((r) => r.slug),
  };
  const snapshotWritten =
    dto.rows.length > 0 &&
    (await store.writeDailySnapshotIfAbsent(date, snapshotRow));

  return {
    ok: true,
    ordering: dto.ordering,
    rowsWritten: dto.rows.length,
    snapshotWritten,
    date,
    reason: fetched.frontendErrored ? "frontend-degraded" : undefined,
    sanityWarnings: dto.sanityWarnings,
  };
}
