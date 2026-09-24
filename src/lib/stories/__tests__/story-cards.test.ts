import { describe, expect, it } from "vitest";
import fixture from "./fixtures/articles-2026-09-24.json";
import type { ArticleItem } from "@/lib/stories/cluster";
import { mergeStoryCards } from "@/lib/stories/story-cards";
import { rankCards } from "@/lib/feed/rank";
import type { Card } from "@/lib/feed/types";

// The corpus is the real 18–24 Sep window; the cards below point at real items in it.
const corpus = fixture.items as ArticleItem[];
const byId = new Map(corpus.map((i) => [i.id, i]));

function press(itemId: string): Card {
  const i = byId.get(itemId)!;
  return {
    id: `press-${itemId}`, type: "PRESS", severity: 45, headline: i.title, sourceName: i.publisher,
    sourceUrl: i.url, timestamp: i.ts, meta: { rssId: itemId.replace(/^rss:/, ""), publisher: i.publisher },
  };
}
function hn(itemId: string): Card {
  const i = byId.get(itemId)!;
  return {
    id: `news-${itemId}`, type: "NEWS", severity: 40, headline: i.title, sourceName: "Hacker News",
    sourceUrl: `https://news.ycombinator.com/item?id=${itemId.replace(/^hn:/, "")}`, timestamp: i.ts,
    meta: { hnId: itemId.replace(/^hn:/, ""), points: i.points ?? 0 },
  };
}
const mover: Card = {
  id: "mm", type: "MODEL_MOVER", severity: 80, headline: "X up 5 ranks", sourceName: "OpenRouter",
  sourceUrl: "https://openrouter.ai", timestamp: "2026-09-23T05:00:00Z", meta: {},
};

const HEISE_OPUS = "rss:4fd15ce28a0e8382";
const MTP_OPUS = "rss:2278a397869846db";
const AV_OPUS = "rss:779b85bfbfa84911";
const LATENT_OPUS = "rss:8552174f627f5844";
const MEDICARE_1 = "hn:49822457";
const MEDICARE_2 = "hn:49822556";
const MUSE_MAC = "rss:9d4fffb4804d4ae0";

describe("mergeStoryCards", () => {
  it("two publisher cards of one story become one card: the earliest, carrying the others as sources", () => {
    const out = mergeStoryCards([press(MTP_OPUS), press(HEISE_OPUS), mover], corpus);
    const press_ = out.filter((c) => c.type === "PRESS");
    expect(press_).toHaveLength(1);
    expect(press_[0].id).toBe(`press-${HEISE_OPUS}`); // Heise published first (16:30 vs 18:59)
    const pubs = press_[0].story!.sources.map((s) => s.publisher);
    // Every other outlet in the story, including ones whose own card is not in the Feed.
    expect(pubs).toEqual(expect.arrayContaining(["MarkTechPost", "Analytics Vidhya", "latent.space"]));
    expect(press_[0].story!.sources.map((s) => s.url)).toContain(byId.get(AV_OPUS)!.url);
    expect(press_[0].story!.sources.map((s) => s.url)).toContain(byId.get(LATENT_OPUS)!.url);
  });

  it("Hacker News posts of one story fold into one card; the others become its discussion", () => {
    const out = mergeStoryCards([hn(MEDICARE_1), hn(MEDICARE_2)], corpus);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(`news-${MEDICARE_1}`);
    const threads = out[0].story!.discussion;
    expect(threads.map((t) => t.url)).toContain("https://news.ycombinator.com/item?id=49822556");
    expect(threads.every((t) => t.site === "Hacker News")).toBe(true);
  });

  it("a card whose story has one item is untouched and carries no story", () => {
    const out = mergeStoryCards([press(MUSE_MAC), mover], corpus);
    expect(out.find((c) => c.id === `press-${MUSE_MAC}`)!.story).toBeUndefined();
    expect(out).toHaveLength(2);
  });

  it("never touches cards that are not articles", () => {
    const out = mergeStoryCards([mover, press(HEISE_OPUS)], corpus);
    expect(out.find((c) => c.id === "mm")).toEqual(mover);
  });

  it("is deterministic in input order", () => {
    const a = mergeStoryCards([press(MTP_OPUS), press(HEISE_OPUS), hn(MEDICARE_2), hn(MEDICARE_1)], corpus);
    const b = mergeStoryCards([hn(MEDICARE_1), press(HEISE_OPUS), hn(MEDICARE_2), press(MTP_OPUS)], corpus);
    const key = (cs: Card[]) => cs.map((c) => `${c.id}:${JSON.stringify(c.story ?? null)}`).sort();
    expect(key(a)).toEqual(key(b));
  });
});

describe("rankCards with stories", () => {
  it("within one kind, the story covered by more sources ranks first; kinds keep their order", () => {
    const [opus] = mergeStoryCards([press(HEISE_OPUS), press(MTP_OPUS)], corpus);
    const lone = { ...press(MUSE_MAC), timestamp: "2026-09-24T09:00:00Z" }; // newer, but one source
    const ranked = rankCards([lone, mover, opus]);
    expect(ranked.map((c) => c.id)).toEqual(["mm", opus.id, lone.id]);
  });
});
