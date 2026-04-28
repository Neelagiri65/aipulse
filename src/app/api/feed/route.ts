/**
 * /api/feed — ranked card stream over the existing Gawk snapshots.
 *
 * Pure derivation: fetches the six existing snapshots in parallel
 * via Promise.allSettled, runs the deterministic derivers, ranks,
 * decides the quiet-day flag, and returns FeedResponse. No new
 * sources, no LLM, no scoring beyond the locked severity tiers
 * declared on /methodology.
 *
 * Each per-snapshot fetch is fail-isolated: if one upstream is down
 * (Anthropic status outage, Redis miss, arXiv blip), that source
 * contributes zero cards rather than tanking the whole feed —
 * graceful degradation per CLAUDE.md.
 */

import { NextResponse } from "next/server";

import { fetchAllStatus } from "@/lib/data/fetch-status";
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
import { fetchLabActivity } from "@/lib/data/fetch-labs";
import { OPENROUTER_SOURCE_CAVEAT } from "@/lib/data/openrouter-types";

import { composeFeed, type FeedSnapshots } from "@/lib/feed/compose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGISTRIES: SdkAdoptionRegistry[] = [
  "pypi",
  "npm",
  "crates",
  "docker",
  "brew",
];

export async function GET() {
  const snapshots = await loadSnapshots();
  const response = composeFeed(snapshots, Date.now());
  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

async function loadSnapshots(): Promise<FeedSnapshots> {
  const nowIso = new Date().toISOString();
  const [status, models, sdk, hn, research, labs] = await Promise.all([
    fetchAllStatus().catch((err) => {
      console.error("[feed] fetch-status failed", err);
      return { data: {}, polledAt: nowIso, failures: [] };
    }),
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
    fetchRecentPapers().catch((err) => {
      console.error("[feed] fetchRecentPapers failed", err);
      return { ok: false as const, papers: [], generatedAt: nowIso };
    }),
    fetchLabActivity().catch((err) => {
      console.error("[feed] fetchLabActivity failed", err);
      return { labs: [], generatedAt: nowIso, failures: [] };
    }),
  ]);

  return { status, models, sdk, hn, research, labs };
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
