/**
 * AI Pulse — NEWS deriver
 *
 * Pure function over `HnWireResult` + a now-millisecond reference.
 * Emits one Card per HN AI-filtered story whose points exceed the
 * locked threshold (`FEED_TRIGGERS.NEWS_HN_POINTS` = 100, strictly
 * greater than) AND whose age is within the locked window
 * (`FEED_TRIGGERS.NEWS_HN_WINDOW_HOURS` = 6).
 *
 * sourceUrl points to the HN comments page for the item, not the
 * external URL — the value AI Pulse adds is surfacing where the
 * conversation is happening, not relinking the same article.
 */

import { HN_AI_STORIES } from "@/lib/data-sources";
import type { HnWireResult } from "@/lib/data/wire-hn";
import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES, FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";

const WINDOW_MS = FEED_TRIGGERS.NEWS_HN_WINDOW_HOURS * 60 * 60 * 1000;

export function deriveNewsCards(
  result: HnWireResult,
  nowMs: number = Date.now(),
): Card[] {
  if (!result.ok) return [];
  const cards: Card[] = [];

  for (const item of result.items) {
    if (item.points <= FEED_TRIGGERS.NEWS_HN_POINTS) continue;
    const itemMs = item.createdAtI * 1000;
    if (nowMs - itemMs > WINDOW_MS) continue;

    cards.push({
      id: cardId("NEWS", `hn:${item.id}`, itemMs),
      type: "NEWS",
      severity: FEED_SEVERITIES.NEWS,
      headline: item.title,
      detail: `${item.points} points · ${item.numComments} comments on Hacker News.`,
      sourceName: HN_AI_STORIES.name.split(" — ")[0] ?? "Hacker News",
      sourceUrl: `https://news.ycombinator.com/item?id=${item.id}`,
      timestamp: item.createdAt,
      meta: {
        hnId: item.id,
        points: item.points,
        numComments: item.numComments,
        author: item.author,
      },
    });
  }
  return cards;
}
