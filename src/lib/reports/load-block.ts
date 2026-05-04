/**
 * Genesis Report — block resolver.
 *
 * Given a `GenesisBlockId`, loads the block's data shape using the
 * existing engines (snapshots, package store, openrouter store, etc.).
 * Each block is a pure transform over already-loaded data; this module
 * is the only IO seam between the report renderer and the rest of the
 * stack.
 *
 * Trust contract:
 *   - Each block returns the canonical `GenesisBlockResult` shape.
 *   - When a block isn't yet implemented (G5 catalogue not yet
 *     filled), returns a structured "not yet implemented" result so
 *     the page renders without crashing AND the launch-readiness
 *     gate (G8) refuses to mark the report ready.
 *   - Per-block load errors are caught here and surfaced as a sanity
 *     warning + empty rows. The report never 500s on a single block
 *     failure — graceful degradation per CLAUDE.md.
 */

import {
  assembleSdkAdoption,
  type SdkAdoptionRegistry,
} from "@/lib/data/sdk-adoption";
import { readLatest, type PackageLatest } from "@/lib/data/pkg-store";
import { readRecentSnapshots, ymdUtc } from "@/lib/data/snapshot";

import { loadSdkAdoptionGainers30dBlock } from "@/lib/reports/blocks/sdk-adoption-gainers-30d";
import { loadSdkAdoptionLosers30dBlock } from "@/lib/reports/blocks/sdk-adoption-losers-30d";
import {
  loadOpenRouterClimbers30dBlock,
  loadOpenRouterFallers30dBlock,
} from "@/lib/reports/blocks/openrouter-rank-movers";
import { redisOpenRouterStore } from "@/lib/data/openrouter-store";
import type {
  GenesisBlockId,
  GenesisBlockResult,
} from "@/lib/reports/types";

const SDK_REGISTRIES: SdkAdoptionRegistry[] = [
  "pypi",
  "npm",
  "crates",
  "docker",
  "brew",
  "vscode",
];

const WINDOW_DAYS = 30;

/**
 * Load the block's data. Returns a structured result for every
 * block id — even unimplemented ones, where the result carries a
 * sanity warning instead of throwing.
 */
export async function loadBlock(
  blockId: GenesisBlockId,
): Promise<GenesisBlockResult> {
  const generatedAt = new Date().toISOString();
  try {
    switch (blockId) {
      case "sdk-adoption-gainers-30d":
        return await loadSdkGainers();
      case "sdk-adoption-losers-30d":
        return await loadSdkLosers();
      case "openrouter-rank-climbers-30d":
        return await loadOpenRouterClimbers();
      case "openrouter-rank-fallers-30d":
        return await loadOpenRouterFallers();
      // G5: remaining 3 block ids land here. Until then, surface a
      // structured "not yet implemented" result so the page doesn't
      // crash and the launch-readiness gate refuses to mark the
      // report ready.
      case "labs-activity-leaders-30d":
      case "tool-incidents-30d":
      case "agents-velocity-30d":
        return {
          rows: [],
          generatedAt,
          sanityWarnings: [
            `Block "${blockId}" is engineering-pending (G5). Not launch-ready.`,
          ],
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      rows: [],
      generatedAt,
      sanityWarnings: [`Block "${blockId}" failed to load: ${msg}`],
    };
  }
}

async function loadSdkGainers(): Promise<GenesisBlockResult> {
  const dto = await loadSdkDto();
  return loadSdkAdoptionGainers30dBlock({ dto, windowDays: WINDOW_DAYS });
}

async function loadSdkLosers(): Promise<GenesisBlockResult> {
  const dto = await loadSdkDto();
  return loadSdkAdoptionLosers30dBlock({ dto, windowDays: WINDOW_DAYS });
}

async function loadOpenRouterClimbers(): Promise<GenesisBlockResult> {
  const snapshots = await redisOpenRouterStore.readSnapshots();
  return loadOpenRouterClimbers30dBlock({
    snapshots,
    windowDays: WINDOW_DAYS,
  });
}

async function loadOpenRouterFallers(): Promise<GenesisBlockResult> {
  const snapshots = await redisOpenRouterStore.readSnapshots();
  return loadOpenRouterFallers30dBlock({
    snapshots,
    windowDays: WINDOW_DAYS,
  });
}

/**
 * Single SDK DTO assembler. Both gainers and losers consume the same
 * shape — calling once per request would be cleaner but page-render
 * is rare enough (1/render, edge-cached at the Vercel layer) that the
 * symmetric "each block loads its own DTO" pattern is fine. If a
 * report ever has 4+ SDK blocks this becomes a per-render memo.
 */
async function loadSdkDto() {
  const today = ymdUtc();
  // Need WINDOW_DAYS + 1 historic snapshots so day-N-ago has a
  // baseline value to compare against today's reading.
  const [snapshots, ...latests] = await Promise.all([
    readRecentSnapshots(WINDOW_DAYS + 1),
    ...SDK_REGISTRIES.map((r) => readLatest(r)),
  ]);
  const pkgLatest: Record<SdkAdoptionRegistry, PackageLatest | null> = {
    pypi: latests[0] ?? null,
    npm: latests[1] ?? null,
    crates: latests[2] ?? null,
    docker: latests[3] ?? null,
    brew: latests[4] ?? null,
    vscode: latests[5] ?? null,
  };
  return assembleSdkAdoption({
    pkgLatest,
    snapshots,
    today,
    windowDays: WINDOW_DAYS,
  });
}
