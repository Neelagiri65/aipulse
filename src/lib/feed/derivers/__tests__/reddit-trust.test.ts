/**
 * Layer A trust test — Reddit NEWS deriver.
 *
 * Output-invariant (prd-trust-harness §1). deriveRedditCards enforces a 12h
 * window; this pins that a stale post is never served as live (S88 class)
 * and that the card cites a real reddit.com comments page (#53 class). The
 * incident fixture mixes a fresh and a stale post and asserts only the fresh
 * survives — the window IS the freshness guarantee.
 */

import { describe, expect, it } from "vitest";

import { deriveRedditCards } from "@/lib/feed/derivers/reddit";
import type { RedditItem } from "@/lib/data/reddit-feed";
import { FEED_TRIGGERS } from "@/lib/feed/thresholds";
import { auditItem, checkFresh, checkResolvableSource } from "@/lib/trust/invariants";

const NOW = Date.parse("2026-04-30T12:00:00.000Z");
const WINDOW_MS = FEED_TRIGGERS.NEWS_REDDIT_WINDOW_HOURS * 60 * 60 * 1000;

function item(overrides: Partial<RedditItem>): RedditItem {
  return {
    id: "abc123",
    sourceId: "reddit-localllama",
    sourceDisplayName: "r/LocalLLaMA",
    title: "Default title",
    url: "https://www.reddit.com/r/LocalLLaMA/comments/abc/post/",
    publishedTs: Math.floor(NOW / 1000) - 60 * 60, // 1h ago
    firstSeenTs: "2026-04-30T11:00:00.000Z",
    lastRefreshTs: "2026-04-30T11:00:00.000Z",
    ...overrides,
  };
}

describe("Reddit NEWS — Layer A trust invariants", () => {
  it("a recent post yields a trustworthy card (fresh + attributed to reddit.com)", () => {
    const cards = deriveRedditCards([item({ id: "a" })], NOW);
    expect(cards).toHaveLength(1);
    const violations = auditItem([
      checkFresh(cards[0].timestamp, NOW, WINDOW_MS),
      checkResolvableSource(cards[0].sourceUrl),
    ]);
    expect(violations).toEqual([]);
    expect(new URL(cards[0].sourceUrl!).host).toBe("www.reddit.com");
  });

  it("INCIDENT (S88): a stale post mixed with a fresh one — only the fresh ships, and it passes freshness", () => {
    const staleTs = Math.floor(NOW / 1000) - 13 * 60 * 60; // 13h > 12h window
    const cards = deriveRedditCards(
      [
        item({ id: "fresh", publishedTs: Math.floor(NOW / 1000) - 60 * 60 }),
        item({ id: "stale", publishedTs: staleTs }),
      ],
      NOW,
    );
    expect(cards.map((c) => c.meta.redditId)).toEqual(["fresh"]);
    for (const c of cards) {
      expect(checkFresh(c.timestamp, NOW, WINDOW_MS)).toBeNull();
    }
  });
});
