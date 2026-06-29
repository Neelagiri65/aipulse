/**
 * /board — prototype of gawk's condensed "state of the AI ecosystem" view
 * (research 2026-06-29). A dense, source-grouped bento that replaces the
 * map as the at-a-glance primary. Lives alongside the homepage for
 * side-by-side comparison; promoting it is a separate decision.
 *
 * Server-rendered from the same feed loader the homepage uses — every
 * card already carries a primary-source URL, so the bento inherits the
 * trust contract for free.
 */

import type { Metadata } from "next";
import { loadFeedResponse } from "@/lib/feed/load";
import type { FeedResponse } from "@/lib/feed/types";
import { BentoBoard } from "@/components/board/BentoBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gawk — State of the AI Ecosystem (board)",
  description:
    "A condensed, source-grouped view of real-time AI-ecosystem activity. Prototype.",
  robots: { index: false },
};

const EMPTY_FEED: FeedResponse = {
  cards: [],
  quietDay: true,
  currentState: {
    topModel: { name: "—", sourceUrl: "" },
    toolHealth: { operational: 0, degraded: 0, total: 0 },
    latestPaper: { title: "—", sourceUrl: "" },
  },
  lastComputed: new Date().toISOString(),
};

export default async function BoardPage() {
  let feed: FeedResponse = EMPTY_FEED;
  try {
    feed = await loadFeedResponse(Date.now());
  } catch (err) {
    // SSR must never throw; a degraded empty board is honest degradation.
    console.error("[board] loadFeedResponse failed", err);
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <BentoBoard feed={feed} />
    </div>
  );
}
