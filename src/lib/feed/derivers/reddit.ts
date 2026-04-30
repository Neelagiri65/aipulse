/**
 * Gawk — Reddit NEWS deriver.
 *
 * Pure function over a list of stored Reddit items + a now-millisecond
 * reference. Emits one NEWS card per Reddit post that landed within
 * `NEWS_REDDIT_WINDOW_HOURS` of `nowMs`, capped at
 * `NEWS_REDDIT_MAX_PER_SUB` per subreddit so a single noisy sub doesn't
 * monopolise the feed.
 *
 * Trust contract:
 *   - Card sourceUrl is the Reddit comments page (not any external link
 *     in the post body) — the value Gawk adds is surfacing the
 *     conversation, not relinking the same article.
 *   - No re-ranking, no score inference, no editorial filter beyond the
 *     window + per-sub cap. The subreddit's `?sort=top&t=day` already
 *     ranks the items the community valued most today.
 *   - Per-sub cap is order-stable: items are taken in the order they
 *     appeared in `items` (which is newest-first per readRecentRedditItems),
 *     so the top three by upstream rank survive the cap.
 */

import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES, FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";
import type { RedditItem } from "@/lib/data/reddit-feed";

const WINDOW_MS = FEED_TRIGGERS.NEWS_REDDIT_WINDOW_HOURS * 60 * 60 * 1000;

export function deriveRedditCards(
  items: RedditItem[],
  nowMs: number = Date.now(),
): Card[] {
  const cards: Card[] = [];
  const perSubCount = new Map<string, number>();

  for (const item of items) {
    const itemMs = item.publishedTs * 1000;
    if (nowMs - itemMs > WINDOW_MS) continue;
    if (itemMs - nowMs > 5 * 60 * 1000) continue; // future-dated guard

    const taken = perSubCount.get(item.sourceId) ?? 0;
    if (taken >= FEED_TRIGGERS.NEWS_REDDIT_MAX_PER_SUB) continue;
    perSubCount.set(item.sourceId, taken + 1);

    cards.push({
      id: cardId("NEWS", `reddit:${item.id}`, itemMs),
      type: "NEWS",
      severity: FEED_SEVERITIES.NEWS,
      headline: item.title,
      detail: `Discussion on ${item.sourceDisplayName}.`,
      sourceName: item.sourceDisplayName,
      sourceUrl: item.url,
      timestamp: new Date(itemMs).toISOString(),
      meta: {
        redditId: item.id,
        subreddit: item.sourceId,
      },
    });
  }
  return cards;
}
