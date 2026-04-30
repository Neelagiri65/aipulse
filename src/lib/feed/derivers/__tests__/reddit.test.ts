import { describe, expect, it } from "vitest";
import { deriveRedditCards } from "@/lib/feed/derivers/reddit";
import type { RedditItem } from "@/lib/data/reddit-feed";

const NOW = Date.parse("2026-04-30T12:00:00.000Z");

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

describe("deriveRedditCards", () => {
  it("returns one NEWS card per recent post within the window", () => {
    const cards = deriveRedditCards(
      [
        item({ id: "a", title: "Post A" }),
        item({ id: "b", title: "Post B" }),
      ],
      NOW,
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].type).toBe("NEWS");
    expect(cards[0].headline).toBe("Post A");
    expect(cards[0].sourceName).toBe("r/LocalLLaMA");
    expect(cards[0].sourceUrl).toContain("reddit.com");
    expect(cards[0].meta.subreddit).toBe("reddit-localllama");
  });

  it("drops posts older than the locked window", () => {
    const oneDayAgo = Math.floor(NOW / 1000) - 24 * 60 * 60;
    const cards = deriveRedditCards(
      [item({ id: "old", publishedTs: oneDayAgo })],
      NOW,
    );
    expect(cards).toHaveLength(0);
  });

  it("drops far-future posts (Reddit edited-post bug)", () => {
    const future = Math.floor(NOW / 1000) + 60 * 60;
    const cards = deriveRedditCards(
      [item({ id: "future", publishedTs: future })],
      NOW,
    );
    expect(cards).toHaveLength(0);
  });

  it("caps emitted cards at NEWS_REDDIT_MAX_PER_SUB per subreddit", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      item({ id: `a${i}`, title: `Post ${i}` }),
    );
    const cards = deriveRedditCards(items, NOW);
    // Locked cap is 3; with 10 inputs we get exactly 3.
    expect(cards).toHaveLength(3);
    // Order-stable: first three taken.
    expect(cards.map((c) => c.headline)).toEqual([
      "Post 0",
      "Post 1",
      "Post 2",
    ]);
  });

  it("counts the per-sub cap separately for different subreddits", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) =>
        item({
          id: `local${i}`,
          sourceId: "reddit-localllama",
          sourceDisplayName: "r/LocalLLaMA",
          title: `Local ${i}`,
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        item({
          id: `claude${i}`,
          sourceId: "reddit-claudeai",
          sourceDisplayName: "r/ClaudeAI",
          title: `Claude ${i}`,
        }),
      ),
    ];
    const cards = deriveRedditCards(items, NOW);
    // 3 per sub × 2 subs = 6
    expect(cards).toHaveLength(6);
    const local = cards.filter((c) => c.meta.subreddit === "reddit-localllama");
    const claude = cards.filter((c) => c.meta.subreddit === "reddit-claudeai");
    expect(local).toHaveLength(3);
    expect(claude).toHaveLength(3);
  });

  it("emits an empty array when given no items (cron hasn't run yet)", () => {
    expect(deriveRedditCards([], NOW)).toEqual([]);
  });

  it("links to the Reddit comments page, not any external article URL", () => {
    const cards = deriveRedditCards(
      [
        item({
          url: "https://www.reddit.com/r/LocalLLaMA/comments/xyz/cool_post/",
        }),
      ],
      NOW,
    );
    expect(cards[0].sourceUrl).toContain("reddit.com");
    expect(cards[0].sourceUrl).toContain("/comments/");
  });
});
