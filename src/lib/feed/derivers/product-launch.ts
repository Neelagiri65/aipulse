/**
 * Gawk — PRODUCT_LAUNCH deriver
 *
 * Pure function over `ProductHuntResult`. Emits one Card per AI launch in the
 * day's top Product Hunt "Artificial Intelligence" topic. Order is preserved as
 * PH delivers it (their RANKING). The card cites the public PH launch page.
 *
 * Severity is fixed at FEED_SEVERITIES.PRODUCT_LAUNCH. Returns [] on a failed
 * fetch or missing token — graceful degradation, never fabricated.
 */

import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";
import type { ProductHuntResult } from "@/lib/data/fetch-producthunt";

const TOP_N = 8;
const SOURCE_NAME = "Product Hunt";

export function deriveProductLaunchCards(result: ProductHuntResult): Card[] {
  if (!result.ok) return [];
  const cards: Card[] = [];
  for (const post of result.posts.slice(0, TOP_N)) {
    if (!post || !post.id || !post.url) continue;
    const timestampMs = new Date(post.createdAt).getTime();
    const tsMs = Number.isNaN(timestampMs) ? 0 : timestampMs;
    cards.push({
      id: cardId("PRODUCT_LAUNCH", `ph:${post.id}`, tsMs),
      type: "PRODUCT_LAUNCH",
      severity: FEED_SEVERITIES.PRODUCT_LAUNCH,
      headline: post.tagline ? `${post.name}: ${post.tagline}` : post.name,
      detail: typeof post.votesCount === "number" ? `${post.votesCount} upvotes on Product Hunt` : undefined,
      sourceName: SOURCE_NAME,
      sourceUrl: post.url,
      timestamp: tsMs ? new Date(tsMs).toISOString() : result.generatedAt,
      meta: {
        votes: typeof post.votesCount === "number" ? post.votesCount : 0,
        tagline: post.tagline ?? "",
      },
    });
  }
  return cards;
}
