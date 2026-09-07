import { describe, expect, it } from "vitest";
import { FEED_TRIGGERS } from "../thresholds";
import type { Card } from "../types";
import { KIND_LABEL, KIND_PLURAL, STATUS_WORD, rowMark, stateWord, whySurfaced } from "../why-surfaced";

const base = (over: Partial<Card>): Card => ({
  id: "x",
  type: "NEWS",
  severity: 40,
  headline: "h",
  sourceName: "Hacker News",
  sourceUrl: "https://news.ycombinator.com/item?id=1",
  timestamp: "2026-09-07T09:00:00Z",
  meta: {},
  ...over,
});

describe("why-surfaced", () => {
  it("every kind has a label and a plural", () => {
    for (const k of Object.keys(KIND_LABEL)) expect(KIND_PLURAL[k as keyof typeof KIND_PLURAL]).toBeTruthy();
  });

  it("model mover: the sentence carries the card's ranks and the LOCKED delta, not a literal", () => {
    const s = whySurfaced(base({ type: "MODEL_MOVER", severity: 80, sourceName: "OpenRouter", meta: { currentRank: 16, previousRank: 5, delta: 11 } }));
    expect(s).toContain("from #5 to #16");
    expect(s).toContain(`more than ${FEED_TRIGGERS.MODEL_MOVER_RANK_DELTA} ranks`);
  });

  it("sdk trend: signed percentage from meta and the LOCKED threshold", () => {
    const s = whySurfaced(base({ type: "SDK_TREND", severity: 60, meta: { registry: "docker", deltaPct: -11 } }));
    expect(s).toContain("on docker moved -11%");
    expect(s).toContain(`more than ${FEED_TRIGGERS.SDK_TREND_WOW_PCT}%`);
    expect(whySurfaced(base({ type: "SDK_TREND", severity: 60, meta: { registry: "npm", deltaPct: 14 } }))).toContain("moved +14%");
  });

  it("news: Hacker News and Reddit cards cite their own rule", () => {
    const hn = whySurfaced(base({ type: "NEWS", meta: {} }));
    expect(hn).toContain(`${FEED_TRIGGERS.NEWS_HN_POINTS} points`);
    expect(hn).toContain(`${FEED_TRIGGERS.NEWS_HN_WINDOW_HOURS} hours`);
    const rd = whySurfaced(base({ type: "NEWS", sourceName: "r/LocalLLaMA", meta: { redditId: "a", subreddit: "reddit-localllama" } }));
    expect(rd).toContain("r/LocalLLaMA");
    expect(rd).toContain(`${FEED_TRIGGERS.NEWS_REDDIT_WINDOW_HOURS} hours`);
    expect(rd).toContain(`${FEED_TRIGGERS.NEWS_REDDIT_MAX_PER_SUB} posts per subreddit`);
  });

  it("new release: age window and minimum likes from the LOCKED triggers", () => {
    const s = whySurfaced(base({ type: "NEW_RELEASE", severity: 70, meta: {} }));
    expect(s).toContain(`${FEED_TRIGGERS.NEW_RELEASE_AGE_HOURS} hours`);
    expect(s).toContain(`${FEED_TRIGGERS.NEW_RELEASE_MIN_LIKES} likes`);
  });

  it("product launch, research, lab highlight: the upstream's own order, with the card's numbers", () => {
    expect(whySurfaced(base({ type: "PRODUCT_LAUNCH", severity: 50, meta: { votes: 399 } }))).toContain("399 upvotes");
    expect(whySurfaced(base({ type: "RESEARCH", severity: 20, meta: { primaryCategory: "cs.CV" } }))).toContain("cs.CV");
    expect(whySurfaced(base({ type: "LAB_HIGHLIGHT", severity: 10, meta: { total: 198 } }))).toContain("(198)");
  });

  it("tool alert: the status page's own state word, incidents counted; mark and tone follow the state", () => {
    const outage = base({ type: "TOOL_ALERT", severity: 100, sourceName: "Anthropic Status", meta: { status: "major_outage", activeIncidents: 1 } });
    expect(whySurfaced(outage)).toContain(`Anthropic Status reported ${STATUS_WORD.major_outage} with 1 active incident.`);
    expect(rowMark(outage)).toBe("hatched");
    expect(stateWord(outage)).toEqual({ word: "a major outage", tone: "out" });
    const green = base({ type: "TOOL_ALERT", severity: 100, meta: { status: "operational", activeIncidents: 0 } });
    expect(rowMark(green)).toBe("solid");
    expect(stateWord(green)).toEqual({ word: "operational", tone: "op" });
    const degraded = base({ type: "TOOL_ALERT", severity: 100, meta: { status: "degraded", activeIncidents: 0 } });
    expect(stateWord(degraded)?.tone).toBe("ink");
    expect(rowMark(base({ type: "NEWS" }))).toBe("solid");
    expect(stateWord(base({ type: "NEWS" }))).toBeNull();
  });
});
