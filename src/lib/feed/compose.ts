/**
 * AI Pulse — Feed composition (pure)
 *
 * Takes the six existing snapshots and returns a fully-formed
 * FeedResponse. Pure function — no IO, no clock reads (nowMs is
 * passed in). The `/api/feed` route does the IO and calls this.
 *
 * Composition steps:
 *   1. Run each deriver against its snapshot.
 *   2. Concatenate all card arrays.
 *   3. Rank by severity desc, timestamp desc within tier.
 *   4. Decide quiet-day flag.
 *   5. Build current-state summary (always populated, used by the
 *      quiet-day banner; available to UI regardless).
 */

import type { StatusResult } from "@/lib/data/fetch-status";
import type { ModelUsageDto } from "@/lib/data/openrouter-types";
import type { SdkAdoptionDto } from "@/lib/data/sdk-adoption";
import type { HnWireResult } from "@/lib/data/wire-hn";
import type { ResearchResult } from "@/lib/data/fetch-research";
import type { LabsPayload } from "@/lib/data/fetch-labs";

import { deriveToolAlertCards } from "@/lib/feed/derivers/tool-alert";
import { deriveModelMoverCards } from "@/lib/feed/derivers/model-mover";
import { deriveSdkTrendCards } from "@/lib/feed/derivers/sdk-trend";
import { deriveNewsCards } from "@/lib/feed/derivers/news";
import { deriveResearchCards } from "@/lib/feed/derivers/research";
import { deriveLabHighlightCards } from "@/lib/feed/derivers/lab-highlight";
import { rankCards } from "@/lib/feed/rank";
import { isQuietDay } from "@/lib/feed/quiet-day";
import type { CurrentState, FeedResponse } from "@/lib/feed/types";

export type FeedSnapshots = {
  status: StatusResult;
  models: ModelUsageDto;
  sdk: SdkAdoptionDto;
  hn: HnWireResult;
  research: ResearchResult;
  labs: LabsPayload;
};

export function composeFeed(
  snapshots: FeedSnapshots,
  nowMs: number = Date.now(),
): FeedResponse {
  const cards = [
    ...deriveToolAlertCards(snapshots.status),
    ...deriveModelMoverCards(snapshots.models),
    ...deriveSdkTrendCards(snapshots.sdk),
    ...deriveNewsCards(snapshots.hn, nowMs),
    ...deriveResearchCards(snapshots.research),
    ...deriveLabHighlightCards(snapshots.labs),
  ];

  return {
    cards: rankCards(cards),
    quietDay: isQuietDay(cards, nowMs),
    currentState: buildCurrentState(snapshots),
    lastComputed: new Date(nowMs).toISOString(),
  };
}

function buildCurrentState(snapshots: FeedSnapshots): CurrentState {
  const topRow = snapshots.models.rows[0];
  const topModel = topRow
    ? { name: topRow.name, sourceUrl: topRow.hubUrl }
    : { name: "—", sourceUrl: "https://openrouter.ai" };

  let operational = 0;
  let degraded = 0;
  let total = 0;
  for (const health of Object.values(snapshots.status.data)) {
    if (!health) continue;
    total += 1;
    if (health.status === "operational") operational += 1;
    else if (health.status !== "unknown") degraded += 1;
  }

  const latestPaperRow = snapshots.research.papers[0];
  const latestPaper = latestPaperRow
    ? { title: latestPaperRow.title, sourceUrl: latestPaperRow.abstractUrl }
    : { title: "—", sourceUrl: "https://arxiv.org/list/cs.AI/recent" };

  return {
    topModel,
    toolHealth: { operational, degraded, total },
    latestPaper,
  };
}
