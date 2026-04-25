/**
 * /api/panels/model-usage — read endpoint for the OpenRouter Model
 * Usage panel.
 *
 * Reads the single `openrouter:rankings:latest` blob (written by the
 * 6h cron at /api/cron/openrouter-rankings) and returns it. Public,
 * no auth — the data is already public on openrouter.ai.
 *
 * Cache: public s-maxage=300 / SWR=60. Cron writes every 6h, so 5
 * minutes of edge cache is generous; SWR keeps the panel responsive
 * while the next read resolves.
 *
 * Query params:
 *   - limit (1-100, default 30) — clamps the row count served back.
 *
 * Note for v1 (S38-A5): the `ordering` query param is accepted but
 * only `top-weekly` is supported. The trending toggle in the panel
 * UI deep-links out to openrouter.ai when the diff flag fires; we
 * do not store a separate trending DTO. Plumbing that comes back
 * if usage signals it's worth the second blob.
 */

import { NextResponse } from "next/server";

import { redisOpenRouterStore, type OpenRouterStore } from "@/lib/data/openrouter-store";
import { OPENROUTER_SOURCE_CAVEAT, type ModelUsageDto } from "@/lib/data/openrouter-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 30;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

export type ModelUsageDeps = {
  store: OpenRouterStore;
  now: () => Date;
};

const DEFAULT_DEPS: ModelUsageDeps = {
  store: redisOpenRouterStore,
  now: () => new Date(),
};

export async function handleGetModelUsage(
  request: Request,
  deps: ModelUsageDeps = DEFAULT_DEPS,
): Promise<{ dto: ModelUsageDto; cacheHeader: string }> {
  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT);

  const stored = await deps.store.readRankingsLatest();
  const dto = stored ?? buildEmptyDto(deps.now);
  const trimmed: ModelUsageDto = {
    ...dto,
    rows: dto.rows.slice(0, limit),
  };
  return {
    dto: trimmed,
    cacheHeader: "public, s-maxage=300, stale-while-revalidate=60",
  };
}

export async function GET(request: Request) {
  const { dto, cacheHeader } = await handleGetModelUsage(request);
  return NextResponse.json(dto, {
    headers: { "Cache-Control": cacheHeader },
  });
}

/**
 * Empty fallback DTO returned when no Redis blob exists yet (the
 * cron has never run, or the env vars are missing in dev). Keeps
 * the panel's loading UX honest — empty rows + the canonical caveat
 * string + ordering="catalogue-fallback" so the panel surfaces the
 * inline banner about upstream not being available.
 */
function buildEmptyDto(now: () => Date): ModelUsageDto {
  const iso = now().toISOString();
  return {
    ordering: "catalogue-fallback",
    generatedAt: iso,
    fetchedAt: iso,
    rows: [],
    trendingDiffersFromTopWeekly: false,
    sanityWarnings: [],
    sourceCaveat: OPENROUTER_SOURCE_CAVEAT,
  };
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
