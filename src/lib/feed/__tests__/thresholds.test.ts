import { describe, expect, it } from "vitest";
import { FEED_SEVERITIES, FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { CardType } from "@/lib/feed/types";

describe("FEED_SEVERITIES", () => {
  it("matches the locked formula exactly", () => {
    expect(FEED_SEVERITIES.TOOL_ALERT).toBe(100);
    expect(FEED_SEVERITIES.MODEL_MOVER).toBe(80);
    expect(FEED_SEVERITIES.NEW_RELEASE).toBe(70);
    expect(FEED_SEVERITIES.SDK_TREND).toBe(60);
    expect(FEED_SEVERITIES.NEWS).toBe(40);
    expect(FEED_SEVERITIES.RESEARCH).toBe(20);
    expect(FEED_SEVERITIES.LAB_HIGHLIGHT).toBe(10);
  });

  it("is frozen — runtime mutation is rejected", () => {
    expect(Object.isFrozen(FEED_SEVERITIES)).toBe(true);
  });

  it("covers all seven card types and nothing else", () => {
    const expected: CardType[] = [
      "TOOL_ALERT",
      "MODEL_MOVER",
      "NEW_RELEASE",
      "SDK_TREND",
      "NEWS",
      "RESEARCH",
      "LAB_HIGHLIGHT",
    ];
    expect(Object.keys(FEED_SEVERITIES).sort()).toEqual([...expected].sort());
  });

  it("severities sort cleanly into a strict descending order", () => {
    const values = Object.values(FEED_SEVERITIES).sort((a, b) => b - a);
    expect(values).toEqual([100, 80, 70, 60, 40, 20, 10]);
  });
});

describe("FEED_TRIGGERS", () => {
  it("locks the numeric trigger thresholds from the PRD", () => {
    expect(FEED_TRIGGERS.MODEL_MOVER_RANK_DELTA).toBe(3);
    expect(FEED_TRIGGERS.SDK_TREND_WOW_PCT).toBe(10);
    expect(FEED_TRIGGERS.NEWS_HN_POINTS).toBe(100);
    expect(FEED_TRIGGERS.NEWS_HN_WINDOW_HOURS).toBe(6);
    expect(FEED_TRIGGERS.NEW_RELEASE_AGE_HOURS).toBe(48);
    expect(FEED_TRIGGERS.NEW_RELEASE_MIN_LIKES).toBe(5);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(FEED_TRIGGERS)).toBe(true);
  });
});
