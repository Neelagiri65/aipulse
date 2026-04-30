/**
 * Gawk — Feed snapshot loader
 *
 * Loads the six snapshots that compose the ranked feed, with per-source
 * last-known caching for the three live-HTTP sources (status, research,
 * labs). The other three (OpenRouter rankings, SDK adoption, HN wire)
 * are already Redis-backed cron snapshots, so a missing key reflects
 * "cron hasn't run yet" rather than upstream death — caching them again
 * would just shadow that signal.
 *
 * Used by both `/api/feed` (dynamic route) and the root server component
 * (`src/app/page.tsx`) so SSR and the client refresh share one path.
 */

import { fetchAllStatus, type StatusResult } from "@/lib/data/fetch-status";
import { redisOpenRouterStore } from "@/lib/data/openrouter-store";
import {
  ymdUtc,
  readRecentSnapshots,
} from "@/lib/data/snapshot";
import { readLatest } from "@/lib/data/pkg-store";
import {
  assembleSdkAdoption,
  type SdkAdoptionRegistry,
} from "@/lib/data/sdk-adoption";
import { readWire } from "@/lib/data/hn-store";
import { fetchRecentPapers } from "@/lib/data/fetch-research";
import {
  fetchRecentModels,
  type HuggingFaceModel,
} from "@/lib/data/fetch-models";
import { fetchLabActivity } from "@/lib/data/fetch-labs";
import { readRecentRedditItems } from "@/lib/data/reddit-feed";
import { OPENROUTER_SOURCE_CAVEAT } from "@/lib/data/openrouter-types";
import type { ResearchResult } from "@/lib/data/fetch-research";
import type { LabsPayload } from "@/lib/data/fetch-labs";

import type { FeedSnapshots } from "@/lib/feed/compose";
import { composeFeed } from "@/lib/feed/compose";
import {
  withLastKnown,
  type LastKnownResult,
} from "@/lib/feed/last-known";
import type { FeedResponse, StaleSource } from "@/lib/feed/types";

const REGISTRIES: SdkAdoptionRegistry[] = [
  "pypi",
  "npm",
  "crates",
  "docker",
  "brew",
  "vscode",
];

export type LoadedSnapshots = {
  snapshots: FeedSnapshots;
  staleSources: StaleSource[];
};

export async function loadSnapshots(
  nowMs: number = Date.now(),
): Promise<LoadedSnapshots> {
  const nowIso = new Date(nowMs).toISOString();

  const [status, models, sdk, hn, research, labs, hfRecent, reddit] = await Promise.all([
    withLastKnown<StatusResult>(
      "status",
      () => fetchAllStatus(),
      { data: {}, polledAt: nowIso, failures: [] },
    ),
    redisOpenRouterStore.readRankingsLatest().then(
      (dto) =>
        dto ?? {
          ordering: "catalogue-fallback" as const,
          generatedAt: nowIso,
          fetchedAt: nowIso,
          rows: [],
          trendingDiffersFromTopWeekly: false,
          sanityWarnings: [],
          sourceCaveat: OPENROUTER_SOURCE_CAVEAT,
        },
      (err) => {
        console.error("[feed] readRankingsLatest failed", err);
        return {
          ordering: "catalogue-fallback" as const,
          generatedAt: nowIso,
          fetchedAt: nowIso,
          rows: [],
          trendingDiffersFromTopWeekly: false,
          sanityWarnings: [],
          sourceCaveat: OPENROUTER_SOURCE_CAVEAT,
        };
      },
    ),
    loadSdk(nowIso),
    readWire().catch((err) => {
      console.error("[feed] readWire failed", err);
      return {
        ok: false as const,
        items: [],
        points: [],
        polledAt: nowIso,
        coverage: {
          itemsTotal: 0,
          itemsWithLocation: 0,
          geocodeResolutionPct: 0,
        },
        meta: { lastFetchOkTs: null, staleMinutes: null },
        source: "unavailable" as const,
      };
    }),
    withLastKnown<ResearchResult>(
      "research",
      async () => {
        const r = await fetchRecentPapers();
        // arxiv soft-fails with ok:false rather than throwing. Treat
        // soft-fail as a fresh-fetch failure so the cache fallback runs.
        if (!r.ok) throw new Error(r.error ?? "research soft-fail");
        return r;
      },
      { ok: false, papers: [], generatedAt: nowIso, stale: true } as ResearchResult,
    ),
    withLastKnown<LabsPayload>(
      "labs",
      async () => fetchLabActivity(),
      { labs: [], generatedAt: nowIso, failures: [] },
    ),
    withLastKnown<HuggingFaceModel[]>(
      "hf-recent",
      async () => {
        const r = await fetchRecentModels();
        if (!r.ok) throw new Error(r.error ?? "hf-recent soft-fail");
        return r.models;
      },
      [] as HuggingFaceModel[],
    ),
    // Reddit is cron-driven into Redis (matches HN posture). No
    // last-known wrapper because empty-list is the correct "cron
    // hasn't run yet" signal — there's no upstream HTTP failure to
    // mask.
    readRecentRedditItems(50).catch((err) => {
      console.error("[feed] readRecentRedditItems failed", err);
      return [] as Awaited<ReturnType<typeof readRecentRedditItems>>;
    }),
  ]);

  const snapshots: FeedSnapshots = {
    status: status.data,
    models,
    sdk,
    hn,
    research: research.data,
    labs: labs.data,
    hfRecent: hfRecent.data,
    reddit,
  };

  const staleSources = collectStale(
    { source: "status", result: status },
    { source: "research", result: research },
    { source: "labs", result: labs },
    { source: "hf-recent", result: hfRecent },
  );

  return { snapshots, staleSources };
}

export async function loadFeedResponse(
  nowMs: number = Date.now(),
): Promise<FeedResponse> {
  const { snapshots, staleSources } = await loadSnapshots(nowMs);
  const response = composeFeed(snapshots, nowMs);
  return staleSources.length > 0
    ? { ...response, staleSources }
    : response;
}

function collectStale(
  ...entries: { source: string; result: LastKnownResult<unknown> }[]
): StaleSource[] {
  const out: StaleSource[] = [];
  for (const { source, result } of entries) {
    if (result.staleAsOf) out.push({ source, staleAsOf: result.staleAsOf });
  }
  return out;
}

async function loadSdk(nowIso: string) {
  try {
    const today = ymdUtc();
    const [snaps, ...latests] = await Promise.all([
      readRecentSnapshots(31),
      ...REGISTRIES.map((r) => readLatest(r)),
    ]);
    const pkgLatest = {
      pypi: latests[0] ?? null,
      npm: latests[1] ?? null,
      crates: latests[2] ?? null,
      docker: latests[3] ?? null,
      brew: latests[4] ?? null,
      vscode: latests[5] ?? null,
    };
    return assembleSdkAdoption({
      pkgLatest,
      snapshots: snaps,
      today,
      windowDays: 30,
      baselineWindow: 30,
      now: () => new Date(),
    });
  } catch (err) {
    console.error("[feed] loadSdk failed", err);
    return { packages: [], generatedAt: nowIso };
  }
}
