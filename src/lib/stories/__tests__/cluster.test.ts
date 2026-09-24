import { describe, expect, it } from "vitest";
import fixture from "./fixtures/articles-2026-09-24.json";
import golden from "./fixtures/golden-2026-09-24.json";
import {
  canonicalUrl,
  clusterStories,
  nameTokens,
  type ArticleItem,
} from "@/lib/stories/cluster";

const items = fixture.items as ArticleItem[];

function item(id: string, title: string, ts: string, extra: Partial<ArticleItem> = {}): ArticleItem {
  return { id, source: "rss", publisher: id, lang: "en", title, url: `https://example.com/${id}`, ts, ...extra };
}

describe("canonicalUrl", () => {
  it("drops query, fragment, www and a trailing slash; lowercases the host", () => {
    expect(canonicalUrl("https://WWW.Heise.de/news/X-1.html?wt_mc=rss#top")).toBe("https://heise.de/news/X-1.html");
    expect(canonicalUrl("https://example.com/a/")).toBe("https://example.com/a");
  });
});

describe("nameTokens", () => {
  it("keeps product and model names, drops announcement verbs", () => {
    const t = nameTokens("Anthropic Releases Claude Opus 5.5: Fable 5.1-Level Performance");
    expect(t).toEqual(expect.arrayContaining(["anthropic", "claude", "opus", "5.5"]));
    expect(t).not.toContain("releases");
  });

  it("keeps digit-bearing compounds whole and splits plain hyphenated words", () => {
    expect(nameTokens("OpenAI Releases GPT-6 Sol and Luna")).toEqual(expect.arrayContaining(["gpt-6", "sol", "luna"]));
    expect(nameTokens("Qwen-Image-2.1: Neues KI-Bildmodell")).toContain("qwen-image-2.1");
    expect(nameTokens("OpenAI-Agent knackt australisches Regierungsportal")).toEqual(
      expect.arrayContaining(["openai", "agent"]),
    );
  });
});

describe("clusterStories", () => {
  it("the same article URL is one story, whatever the headlines say", () => {
    const a = item("a", "Something happened", "2026-09-20T10:00:00Z", { url: "https://x.com/story?utm_source=rss&utm_medium=feed" });
    const b = item("b", "Totally different words", "2026-09-20T11:00:00Z", { url: "https://www.x.com/story/" });
    const out = clusterStories([a, b]);
    expect(out.find((c) => c.memberIds.includes("a"))?.memberIds.sort()).toEqual(["a", "b"]);
  });

  it("shared names more than 48 h apart stay separate stories", () => {
    const a = item("a", "Meta Launches Muse Zephyr Agent", "2026-09-19T07:00:00Z", { publisher: "P1" });
    const b = item("b", "Meta Muse Zephyr Agent blocked", "2026-09-22T08:00:00Z", { publisher: "P2" });
    const out = clusterStories([a, b], { corpus: items });
    expect(out.every((c) => c.memberIds.length === 1)).toBe(true);
    // …and the same pair a day apart IS one story, so the window is what separated them.
    const near = clusterStories([a, { ...b, ts: "2026-09-20T07:00:00Z" }], { corpus: items });
    expect(near.some((c) => c.memberIds.length === 2)).toBe(true);
  });

  it("is deterministic: input order never changes the stories or their ids", () => {
    const shuffled = [...items].reverse();
    const norm = (cs: ReturnType<typeof clusterStories>) =>
      cs.map((c) => `${c.id}:${[...c.memberIds].sort().join(",")}`).sort();
    expect(norm(clusterStories(shuffled))).toEqual(norm(clusterStories(items)));
  });

  it("the lead is the earliest publisher item, else the earliest item", () => {
    const hn = item("hn", "Claude Zeta 9.9 ships", "2026-09-20T09:00:00Z", { source: "hn", publisher: "Hacker News" });
    const pub = item("pub", "Anthropic ships Claude Zeta 9.9", "2026-09-20T10:00:00Z", { publisher: "Heise" });
    // Rarity is measured against a corpus; two items alone make every shared word common.
    const [story] = clusterStories([hn, pub], { corpus: items }).filter((c) => c.memberIds.length > 1);
    expect(story.leadId).toBe("pub");
  });
});

describe("golden set (hand-labelled 2026-09-24, before the code existed)", () => {
  const clusterOf = new Map<string, string>();
  for (const c of clusterStories(items)) for (const m of c.memberIds) clusterOf.set(m, c.id);
  const ambiguous = new Set(golden.ambiguous);
  const storyOf = new Map<string, string>();
  for (const [k, ids] of Object.entries(golden.stories)) for (const id of ids) storyOf.set(id, k);
  const scored = items.map((i) => i.id).filter((id) => !ambiguous.has(id));

  let found = 0, missed = 0, falsePairs = 0;
  const falseList: string[] = [];
  for (let i = 0; i < scored.length; i++)
    for (let j = i + 1; j < scored.length; j++) {
      const a = scored[i], b = scored[j];
      const same = storyOf.get(a) !== undefined && storyOf.get(a) === storyOf.get(b);
      const together = clusterOf.get(a) === clusterOf.get(b);
      if (same && together) found++;
      else if (same) missed++;
      else if (together) { falsePairs++; falseList.push(`${a} + ${b}`); }
    }
  const truePairs = found + missed;

  it("reports its counts (printed so the PR can quote them)", () => {
    console.log(`golden: ${found}/${truePairs} true pairs found, ${missed} missed, ${falsePairs} false pairs`, falseList);
    expect(truePairs).toBeGreaterThan(0);
  });

  // The one named near-miss the rule cannot separate: two different GPT-6 Astra stories posted to
  // Hacker News the same day share only the product's name. Pinned as KNOWN so a fix shows up.
  const ASTRA = ["hn:49814019", "hn:49817404"];
  const isAstra = ([a, b]: string[]) => ASTRA.includes(a) && ASTRA.includes(b);

  it("keeps the other named near-misses apart (Muse ×3, Splunk, AI spending, MiMo, Jev look-alikes …)", () => {
    const merged = golden.mustStaySeparate
      .filter((p) => !isAstra(p))
      .filter(([a, b]) => clusterOf.get(a) === clusterOf.get(b));
    expect(merged).toEqual([]);
  });

  it.fails("KNOWN LIMITATION: the two GPT-6 Astra stories are merged", () => {
    const pair = golden.mustStaySeparate.find(isAstra)!;
    expect(clusterOf.get(pair[0])).not.toBe(clusterOf.get(pair[1]));
  });

  it("regression floor: finds at least 60% of the true pairs with no more than 3 false pairs", () => {
    expect(found / truePairs).toBeGreaterThanOrEqual(0.6);
    expect(falsePairs).toBeLessThanOrEqual(3);
  });
});
