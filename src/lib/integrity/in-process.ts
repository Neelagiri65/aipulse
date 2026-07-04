/**
 * In-process "fetcher" for probe specs: resolves each spec's URL to the
 * SAME data accessor its route uses, instead of an HTTP round-trip back
 * into this deployment. Self-referential HTTP cold-start-amplified (the
 * function fetching its own /api/feed + /api/globe-events timed the
 * watchdog out — PR #30); calling the accessors directly is faster and
 * can't deadlock on itself. Unknown URLs throw, which the runner turns
 * into a critical report.
 *
 * Shared by /api/integrity (read-only board) and /api/containment/cycle
 * (the containment probe cycle) so the two probe surfaces can never
 * read through different paths.
 */

import { handleGetSdkAdoption } from "@/app/api/panels/sdk-adoption/route";
import { fetchGlobeEvents } from "@/lib/data/fetch-events";
import { redisOpenRouterStore } from "@/lib/data/openrouter-store";
import { loadFeedResponse } from "@/lib/feed/load";

import type { Fetcher } from "./run";

export const inProcessFetcher: Fetcher = async (url) => {
  if (url.endsWith("/api/globe-events")) return fetchGlobeEvents();
  if (url.endsWith("/api/feed")) return loadFeedResponse(Date.now());
  if (url.endsWith("/api/panels/model-usage")) {
    // The STORED blob, not the trimmed panel view — probes judge what was
    // delivered by the cron. A missing blob throws → `reachable` failure
    // (availability), never a fabricated pass.
    const dto = await redisOpenRouterStore.readRankingsLatest();
    if (!dto) throw new Error("openrouter rankings blob missing");
    return dto;
  }
  if (url.endsWith("/api/panels/sdk-adoption")) {
    // Same assembler + deps the panel route uses — one read path (F6).
    const { dto } = await handleGetSdkAdoption(new Request(url));
    return dto;
  }
  throw new Error(`no in-process source for ${url}`);
};
