/**
 * Reddit subreddit registry — community-discussion sources for the feed.
 *
 * Distinct from `rss-sources.ts`: those are geographic press publishers
 * with HQ coordinates that render on the world map. Reddit subreddits
 * have no physical HQ relevant to the dashboard's geographic story —
 * adding them under the regional-rss pipeline would force fake
 * coordinates and dilute the geographic-counterweight narrative
 * (architectural rule established in `project_tool_health_ai_focused.md`).
 *
 * These sources feed NEWS cards via `deriveRedditCards`, alongside the
 * HN-derived NEWS cards. They do NOT appear on the map or the Regional
 * Wire panel.
 *
 * Curation rule: only AI-themed subreddits whose own scope makes the
 * AI-keyword filter unnecessary. r/LocalLLaMA and r/ClaudeAI both meet
 * that bar today; expansion is a checkpoint requiring auditor review.
 */

export type RedditSource = {
  /** Stable kebab-case id; used as Redis key component and citation anchor. */
  id: string;
  /** Subreddit name without the leading r/. Case-preserved per the
   *  subreddit's canonical capitalisation. */
  subreddit: string;
  /** Display label used in card sourceName, e.g. "r/LocalLLaMA". */
  displayName: string;
  /** Atom feed URL. We poll top-of-day so the RSS surfaces what the
   *  subreddit's own community is upvoting, not just chronological noise. */
  rssUrl: string;
  /** Public subreddit URL — click target for a Reddit card. */
  publisherUrl: string;
};

export const REDDIT_SOURCES: readonly RedditSource[] = [
  {
    id: "reddit-localllama",
    subreddit: "LocalLLaMA",
    displayName: "r/LocalLLaMA",
    rssUrl: "https://www.reddit.com/r/LocalLLaMA/.rss?sort=top&t=day",
    publisherUrl: "https://www.reddit.com/r/LocalLLaMA/",
  },
  {
    id: "reddit-claudeai",
    subreddit: "ClaudeAI",
    displayName: "r/ClaudeAI",
    rssUrl: "https://www.reddit.com/r/ClaudeAI/.rss?sort=top&t=day",
    publisherUrl: "https://www.reddit.com/r/ClaudeAI/",
  },
] as const;

export function getRedditSourceById(id: string): RedditSource | undefined {
  return REDDIT_SOURCES.find((s) => s.id === id);
}
