/**
 * /api/panels/agents — read endpoint for the Agents-frameworks panel.
 *
 * Reads `agents:latest` plus the snapshot from 7 days before today
 * (UTC), runs the pure view assembler, and returns the DTO. Public
 * read, no auth — every number on the panel cites a public source
 * (PYPI_DOWNLOADS / NPM_DOWNLOADS / GITHUB_REPO_META) so there's
 * nothing operator-only to gate.
 *
 * Cache: public s-maxage=300 / SWR=60. Underlying cron writes once
 * daily at 06:30 UTC; 5-minute edge cache is well below that without
 * starving the route under burst traffic.
 *
 * Bootstrap-friendly: when the 7d-old snapshot is missing (the panel
 * shipped before 7 days of history accumulated), the assembler
 * returns deltaState="bootstrap" for every row with a null delta.
 * The panel renders downloads/stars/pushedAt regardless.
 */

import { NextResponse } from "next/server";
import {
  readAgentsLatest,
  readAgentsSnapshot,
} from "@/lib/data/agents-store";
import {
  assembleAgentsView,
  type AgentsViewDto,
} from "@/lib/data/agents-view";
import { AGENT_FRAMEWORKS } from "@/lib/data/agents-registry";
import type { AgentFetchResult } from "@/lib/data/agents-fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AgentsPanelDeps = {
  readLatest: () => Promise<AgentFetchResult | null>;
  readSnapshot: (date: string) => Promise<AgentFetchResult | null>;
  now: () => Date;
};

const DEFAULT_DEPS: AgentsPanelDeps = {
  readLatest: readAgentsLatest,
  readSnapshot: readAgentsSnapshot,
  now: () => new Date(),
};

/** Pure handler — accepts injected deps for testing. Returns the DTO
 *  AND the cache header so the production GET can apply both. */
export async function handleGetAgentsPanel(
  deps: AgentsPanelDeps = DEFAULT_DEPS,
): Promise<{ dto: AgentsViewDto | null; cacheHeader: string }> {
  const now = deps.now();
  const [current, sevenDaysAgo] = await Promise.all([
    deps.readLatest(),
    deps.readSnapshot(previousNDaysUtc(now, 7)),
  ]);
  if (!current) {
    return {
      dto: null,
      // No latest blob means the cron hasn't seeded yet. Don't cache
      // the empty state — the next ingest could land any minute.
      cacheHeader: "no-store",
    };
  }
  const dto = assembleAgentsView({
    registry: AGENT_FRAMEWORKS,
    current,
    sevenDaysAgo,
    now: () => now,
  });
  return {
    dto,
    cacheHeader: "public, s-maxage=300, stale-while-revalidate=60",
  };
}

export async function GET() {
  const { dto, cacheHeader } = await handleGetAgentsPanel();
  if (!dto) {
    return NextResponse.json(
      { ok: false, reason: "no-data", message: "agents:latest not seeded yet" },
      { status: 503, headers: { "Cache-Control": cacheHeader } },
    );
  }
  return NextResponse.json(dto, {
    headers: { "Cache-Control": cacheHeader },
  });
}

function previousNDaysUtc(now: Date, n: number): string {
  const ts = now.getTime() - n * 24 * 60 * 60 * 1000;
  const d = new Date(ts);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
