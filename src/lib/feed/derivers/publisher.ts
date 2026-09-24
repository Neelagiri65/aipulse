/**
 * gawk.dev — regional publisher PRESS deriver.
 *
 * Pure over the stored RSS wire items (newest first) and a now-ms reference. One PRESS card per
 * article published within NEWS_PUBLISHER_WINDOW_HOURS, at most NEWS_PUBLISHER_MAX_PER_SOURCE per
 * publisher, taken in the publisher's own order.
 *
 * Trust contract:
 *   - The headline is the publisher's title, verbatim, in its own language. Translation is the
 *     reader's device's job (iOS: Apple's on-device Translation); the stored text is the record.
 *   - sourceUrl is the article on the publisher's site.
 *   - No score, no re-ranking. The cap is the only editorial rule, and it is printed ("why this
 *     surfaced").
 *   - `imagePath` points at gawk.dev's relay for the image the publisher attached, and is absent
 *     when the feed carried none.
 */

import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES, FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";
import { isRssAiRelevant, type RssWireItem } from "@/lib/data/wire-rss";
import { RSS_SOURCES } from "@/lib/data/rss-sources";

const WINDOW_MS = FEED_TRIGGERS.NEWS_PUBLISHER_WINDOW_HOURS * 60 * 60 * 1000;
const AI_FILTERED = new Set(RSS_SOURCES.filter((s) => s.keywordFilterScope === "ai-only").map((s) => s.id));

export function derivePublisherCards(items: RssWireItem[], nowMs: number = Date.now()): Card[] {
  const cards: Card[] = [];
  const perSource = new Map<string, number>();
  for (const item of items) {
    const itemMs = item.publishedTs * 1000;
    if (nowMs - itemMs > WINDOW_MS) continue;
    if (itemMs - nowMs > 5 * 60 * 1000) continue; // future-dated guard

    // Publishers whose whole feed is filtered (Heise) are re-checked here with the current rule:
    // items stored under the old substring match ("rag" in "Snapdragon") would otherwise keep
    // surfacing for their 7-day lifetime.
    if (AI_FILTERED.has(item.sourceId) && !isRssAiRelevant(item.title, item.lang)) continue;

    const taken = perSource.get(item.sourceId) ?? 0;
    if (taken >= FEED_TRIGGERS.NEWS_PUBLISHER_MAX_PER_SOURCE) continue;
    perSource.set(item.sourceId, taken + 1);

    cards.push({
      id: cardId("PRESS", `rss:${item.id}`, itemMs),
      type: "PRESS",
      severity: FEED_SEVERITIES.PRESS,
      headline: item.title,
      detail: `Reported by ${item.sourceDisplayName} (${item.city}, ${item.country}).`,
      sourceName: item.sourceDisplayName,
      sourceUrl: item.url,
      timestamp: new Date(itemMs).toISOString(),
      meta: {
        rssId: item.id,
        publisher: item.sourceId,
        country: item.country,
        lang: item.lang,
        ...(item.imageUrl ? { imagePath: `/api/rss/image/${item.id}` } : {}),
      },
    });
  }
  return cards;
}
