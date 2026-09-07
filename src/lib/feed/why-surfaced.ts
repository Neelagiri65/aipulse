/**
 * Why a card is in the feed, in the reader's words — built from the LOCKED thresholds and the
 * card's own metadata, never from a literal. `/methodology` cites the same constants; a threshold
 * change is one commit and this copy follows it.
 */
import { FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { Card, CardType } from "@/lib/feed/types";

export const KIND_LABEL: Readonly<Record<CardType, string>> = Object.freeze({
  TOOL_ALERT: "Tool alert",
  MODEL_MOVER: "Model mover",
  NEW_RELEASE: "New release",
  SDK_TREND: "SDK trend",
  PRODUCT_LAUNCH: "Product launch",
  NEWS: "News",
  RESEARCH: "Research",
  LAB_HIGHLIGHT: "Lab highlight",
});

export const KIND_PLURAL: Readonly<Record<CardType, string>> = Object.freeze({
  TOOL_ALERT: "Tool alerts",
  MODEL_MOVER: "Model movers",
  NEW_RELEASE: "New releases",
  SDK_TREND: "SDK trends",
  PRODUCT_LAUNCH: "Product launches",
  NEWS: "News",
  RESEARCH: "Research",
  LAB_HIGHLIGHT: "Lab highlights",
});

/** The status page's state, in the words the tool-alert deriver already uses. */
export const STATUS_WORD: Readonly<Record<string, string>> = Object.freeze({
  operational: "operational",
  degraded: "degraded performance",
  partial_outage: "a partial outage",
  major_outage: "a major outage",
});

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/** Tool alerts carry a state word; only "operational" and "… outage" carry colour. */
export function stateWord(card: Card): { word: string; tone: "op" | "out" | "ink" } | null {
  if (card.type !== "TOOL_ALERT") return null;
  const status = str(card.meta.status);
  if (!status) return null;
  const word = STATUS_WORD[status] ?? status.replace(/_/g, " ");
  const tone = status === "operational" ? "op" : /outage/.test(status) ? "out" : "ink";
  return { word, tone };
}

/** Row mark: hatched for a tool alert with a non-operational state or an open incident, solid otherwise. */
export function rowMark(card: Card): "solid" | "hatched" {
  if (card.type !== "TOOL_ALERT") return "solid";
  const status = str(card.meta.status);
  const incidents = num(card.meta.activeIncidents) ?? 0;
  return (status && status !== "operational") || incidents > 0 ? "hatched" : "solid";
}

export function whySurfaced(card: Card): string {
  const m = card.meta;
  const T = FEED_TRIGGERS;
  switch (card.type) {
    case "TOOL_ALERT": {
      const status = str(m.status);
      const incidents = num(m.activeIncidents) ?? 0;
      const state = status ? (STATUS_WORD[status] ?? status.replace(/_/g, " ")) : "a state change";
      const inc = incidents > 0 ? ` with ${incidents} active incident${incidents === 1 ? "" : "s"}` : "";
      return `${card.sourceName} reported ${state}${inc}. Every state change on a tracked status page becomes a tool alert; nothing is ranked or scored.`;
    }
    case "MODEL_MOVER": {
      const prev = num(m.previousRank);
      const cur = num(m.currentRank);
      const move = prev !== undefined && cur !== undefined ? `Moved from #${prev} to #${cur} on OpenRouter's weekly ranking.` : "Moved on OpenRouter's weekly ranking.";
      return `${move} A move of more than ${T.MODEL_MOVER_RANK_DELTA} ranks becomes a model mover; the ranking is OpenRouter's own.`;
    }
    case "SDK_TREND": {
      const pct = num(m.deltaPct);
      const registry = str(m.registry);
      const moved = pct !== undefined ? `moved ${pct > 0 ? "+" : ""}${pct}%` : "moved";
      return `Daily downloads${registry ? ` on ${registry}` : ""} ${moved} against the baseline. A move of more than ${T.SDK_TREND_WOW_PCT}% either way becomes an SDK trend.`;
    }
    case "NEWS": {
      if (str(m.subreddit) || str(m.redditId)) {
        return `Posted on ${card.sourceName} within the last ${T.NEWS_REDDIT_WINDOW_HOURS} hours; at most ${T.NEWS_REDDIT_MAX_PER_SUB} posts per subreddit per window, and the subreddit's own curation is trusted, not a score. The link is the discussion.`;
      }
      return `Passed ${T.NEWS_HN_POINTS} points on Hacker News within ${T.NEWS_HN_WINDOW_HOURS} hours of landing. The link is the discussion, not the article.`;
    }
    case "NEW_RELEASE":
      return `Published on Hugging Face by a major lab within the last ${T.NEW_RELEASE_AGE_HOURS} hours with at least ${T.NEW_RELEASE_MIN_LIKES} likes.`;
    case "PRODUCT_LAUNCH": {
      const votes = num(m.votes);
      return `In Product Hunt's top Artificial Intelligence launches, in Product Hunt's own order${votes !== undefined ? `, with ${votes} upvotes` : ""}. No freshness window: the date shown is the launch's real date.`;
    }
    case "RESEARCH": {
      const cat = str(m.primaryCategory);
      return `One of the five newest papers in arXiv's cs.AI listing${cat ? ` (primary category ${cat})` : ""}, in arXiv's own order by date. Nothing is re-ranked.`;
    }
    case "LAB_HIGHLIGHT": {
      const total = num(m.total);
      return `The registry lab with the most public GitHub events in the last 7 days${total !== undefined ? ` (${total})` : ""}. One card, only when that count is above zero.`;
    }
  }
}
