import { describe, expect, it } from "vitest";
import { isQuietDay } from "@/lib/feed/quiet-day";
import type { Card, Severity } from "@/lib/feed/types";

const NOW = new Date("2026-04-27T12:00:00.000Z").getTime();
const ONE_HOUR = 60 * 60 * 1000;

function card(severity: Severity, hoursAgo: number): Card {
  return {
    id: `${severity}-${hoursAgo}`,
    type: "TOOL_ALERT",
    severity,
    headline: "x",
    sourceName: "test",
    sourceUrl: "https://example.com",
    timestamp: new Date(NOW - hoursAgo * ONE_HOUR).toISOString(),
    meta: {},
  };
}

describe("isQuietDay", () => {
  it("true when the card list is empty", () => {
    expect(isQuietDay([], NOW)).toBe(true);
  });

  it("true when no card has severity >= 40 in the last 24h", () => {
    expect(
      isQuietDay([card(20, 2), card(10, 3)], NOW),
    ).toBe(true);
  });

  it("false when at least one card has severity === 40 in the last 24h (boundary)", () => {
    expect(isQuietDay([card(40, 2)], NOW)).toBe(false);
  });

  it("false when a high-severity card lands in the last 24h", () => {
    expect(isQuietDay([card(100, 1)], NOW)).toBe(false);
  });

  it("true when high-severity cards are all OLDER than 24h", () => {
    expect(isQuietDay([card(100, 25), card(80, 30)], NOW)).toBe(true);
  });

  it("true when high-severity cards are all in the FUTURE (clock skew, defensive)", () => {
    expect(isQuietDay([card(100, -5)], NOW)).toBe(true);
  });
});
