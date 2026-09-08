import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEED_VIEW,
  DEFAULT_TAB,
  PRIMARY_TABS,
  ROOMS_LABEL,
  feedViewFromSearch,
  tabFromSearch,
} from "@/components/chrome/primary-tabs";

describe("primary-tabs", () => {
  it("locks the five surfaces in order with Community carrying the Discord mark", () => {
    expect(PRIMARY_TABS.map((t) => t.id)).toEqual(["health", "feed", "map", "rooms", "more"]);
    expect(ROOMS_LABEL).toBe("Community");
    expect(PRIMARY_TABS.find((t) => t.id === "rooms")?.mark).toBe("discord");
    expect(PRIMARY_TABS.filter((t) => t.mark).length).toBe(1);
  });

  it("reads ?tab= and falls back to the default on anything unknown", () => {
    expect(tabFromSearch("?tab=feed")).toBe("feed");
    expect(tabFromSearch("?tab=rooms")).toBe("rooms");
    expect(tabFromSearch("?tab=globe")).toBe(DEFAULT_TAB);
    expect(tabFromSearch("")).toBe(DEFAULT_TAB);
  });

  it("reads ?view= for the Feed axis and falls back to Stories", () => {
    expect(feedViewFromSearch("?tab=feed&view=wire")).toBe("wire");
    expect(feedViewFromSearch("?view=stories")).toBe("stories");
    expect(feedViewFromSearch("?view=globe")).toBe(DEFAULT_FEED_VIEW);
    expect(feedViewFromSearch("")).toBe(DEFAULT_FEED_VIEW);
  });
});

describe("boards axis (More › board)", () => {
  it("reads ?board= and rejects anything that is not a board", async () => {
    const { boardFromSearch, boardHref, isBoardId, BOARD_IDS } = await import("@/components/chrome/primary-tabs");
    expect(boardFromSearch("?tab=more&board=benchmarks")).toBe("benchmarks");
    expect(boardFromSearch("?board=wire")).toBeNull(); // the Wire is Feed's second view, not a board
    expect(boardFromSearch("?board=globe")).toBeNull();
    expect(boardFromSearch("")).toBeNull();
    expect(isBoardId("sdk-adoption")).toBe(true);
    expect(BOARD_IDS.length).toBe(10);
    expect(boardHref("labs")).toBe("/?tab=more&board=labs");
  });
});
