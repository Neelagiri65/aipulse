/**
 * gawk.dev — story cards (slice B of the Story feed plan, 2026-09-24).
 *
 * After the derivers run, publisher (PRESS) and Hacker News / Reddit (NEWS) cards that report the same
 * story (src/lib/stories/cluster.ts, over the trailing window of every article-shaped item) fold into
 * ONE card:
 *  - the card kept is the earliest publisher card of the story, else its earliest NEWS card — its
 *    headline, link and type are unchanged;
 *  - it carries `story.sources` (every other publisher article in the story, including ones whose own
 *    card is not in the Feed) and `story.discussion` (every Hacker News / Reddit thread);
 *  - the story's other PRESS / NEWS cards leave the Feed.
 * Nothing is scored or rewritten; a story with one item leaves its card exactly as it was. Other card
 * types are never touched. Product Hunt launches are not merged in this slice.
 */
import type { HnWireItem } from "@/lib/data/wire-hn";
import type { RedditItem } from "@/lib/data/reddit-feed";
import type { RssWireItem } from "@/lib/data/wire-rss";
import type { Card, StorySource, StoryThread } from "@/lib/feed/types";
import { clusterStories, type ArticleItem } from "@/lib/stories/cluster";

const HN_THREAD = (id: string) => `https://news.ycombinator.com/item?id=${id}`;

/** The article-shaped items the Feed can see, in the clustering library's shape. */
export function articleCorpus(input: {
  rss: readonly RssWireItem[];
  hn: readonly HnWireItem[];
  reddit: readonly RedditItem[];
}): ArticleItem[] {
  return [
    ...input.rss.map((i): ArticleItem => ({
      id: `rss:${i.id}`, source: "rss", publisher: i.sourceDisplayName, lang: i.lang,
      country: i.country ?? null, title: i.title, url: i.url, ts: new Date(i.publishedTs * 1000).toISOString(),
    })),
    ...input.hn.map((i): ArticleItem => ({
      id: `hn:${i.id}`, source: "hn", publisher: "Hacker News", lang: "en", country: null,
      title: i.title, url: i.url ?? HN_THREAD(i.id), ts: i.createdAt, points: i.points,
    })),
    ...input.reddit.map((i): ArticleItem => ({
      id: `reddit:${i.id}`, source: "reddit", publisher: i.sourceDisplayName, lang: "en", country: null,
      title: i.title, url: i.url, ts: new Date(i.publishedTs * 1000).toISOString(),
    })),
  ];
}

/** The corpus item a card was derived from, if it is an article card. */
function itemIdOf(card: Card): string | null {
  if (card.type === "PRESS" && card.meta.rssId !== undefined) return `rss:${card.meta.rssId}`;
  if (card.type === "NEWS" && card.meta.hnId !== undefined) return `hn:${card.meta.hnId}`;
  if (card.type === "NEWS" && card.meta.redditId !== undefined) return `reddit:${card.meta.redditId}`;
  return null;
}

const byTimeThenId = (a: { ts: string; id: string }, b: { ts: string; id: string }) =>
  a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id);

export function mergeStoryCards(cards: readonly Card[], corpus: readonly ArticleItem[]): Card[] {
  const items = new Map(corpus.map((i) => [i.id, i]));
  const storyOf = new Map<string, string[]>(); // item id → member ids of its story
  for (const s of clusterStories(corpus)) {
    if (s.memberIds.length < 2) continue;
    for (const m of s.memberIds) storyOf.set(m, s.memberIds);
  }

  // The feed's article cards, grouped by story.
  const cardsByStory = new Map<string, Card[]>();
  for (const c of cards) {
    const itemId = itemIdOf(c);
    const members = itemId ? storyOf.get(itemId) : undefined;
    if (!members) continue;
    const key = members[0];
    const list = cardsByStory.get(key);
    if (list) list.push(c); else cardsByStory.set(key, [c]);
  }

  const replace = new Map<string, Card>(); // kept card id → card with story
  const drop = new Set<string>();
  for (const group of cardsByStory.values()) {
    const earliest = (cs: Card[]) =>
      [...cs].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id))[0];
    const keep = earliest(group.filter((c) => c.type === "PRESS")) ?? earliest(group);
    const keptItem = itemIdOf(keep)!;
    const members = storyOf.get(keptItem)!
      .filter((m) => m !== keptItem)
      .map((m) => items.get(m)!)
      .sort(byTimeThenId);

    const sources: StorySource[] = members
      .filter((i) => i.source === "rss")
      .map((i) => ({ publisher: i.publisher, country: i.country ?? null, lang: i.lang, url: i.url, timestamp: i.ts }));
    const discussion: StoryThread[] = members
      .filter((i) => i.source === "hn" || i.source === "reddit")
      .map((i) => ({
        site: i.publisher,
        url: i.source === "hn" ? HN_THREAD(i.id.slice(3)) : i.url,
        points: i.points ?? null,
        timestamp: i.ts,
      }));
    if (sources.length === 0 && discussion.length === 0) continue;

    replace.set(keep.id, { ...keep, story: { sources, discussion } });
    for (const c of group) if (c.id !== keep.id) drop.add(c.id);
  }

  return cards.filter((c) => !drop.has(c.id)).map((c) => replace.get(c.id) ?? c);
}
