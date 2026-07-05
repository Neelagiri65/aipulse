/**
 * GET /api/trust-audit — Layer B live trust auditor (PRD prd-trust-harness §3).
 *
 * Pulls the ACTUAL served output of the audited feeds in-process (same
 * data the user sees — never a re-fetch that could diverge) and runs the
 * trust invariants against it. Returns findings; always 200 (a report, not
 * a gate). The integrity-watch workflow curls it and pages Discord on any
 * finding — so the next incident class is caught by the machine, not the
 * founder.
 *
 * In-process reads (not self-HTTP — the #30 cold-start-deadlock class):
 * the feed via loadFeedResponse, the globe via fetchGlobeEvents, model
 * usage via the store's latest DTO.
 */

import { NextResponse } from "next/server";

import { fetchGlobeEvents } from "@/lib/data/fetch-events";
import { redisOpenRouterStore } from "@/lib/data/openrouter-store";
import { loadFeedResponse } from "@/lib/feed/load";
import { auditServedOutput } from "@/lib/trust/auditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const now = Date.now();

  const [globe, feed, modelUsage] = await Promise.all([
    fetchGlobeEvents().catch(() => null),
    loadFeedResponse(now).catch(() => null),
    redisOpenRouterStore.readRankingsLatest().catch(() => null),
  ]);

  const report = auditServedOutput({
    now,
    globe: globe ? { points: globe.points } : undefined,
    feed: feed ? { cards: feed.cards, lastComputed: feed.lastComputed } : undefined,
    modelUsage: modelUsage
      ? {
          ordering: modelUsage.ordering,
          generatedAt: modelUsage.generatedAt,
          rows: modelUsage.rows,
        }
      : undefined,
  });

  return NextResponse.json({
    ...report,
    generatedAt: new Date(now).toISOString(),
  });
}
