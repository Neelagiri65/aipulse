import { describe, expect, it, vi, beforeEach } from "vitest";

import { FEED_TRIGGERS } from "@/lib/feed/thresholds";

const loadFeedResponse = vi.fn();
vi.mock("@/lib/feed/load", () => ({
  loadFeedResponse: (now: number) => loadFeedResponse(now),
}));

import { GET } from "../route";

const FEED = {
  cards: [{ id: "c1", type: "MODEL_MOVER", severity: 80 }],
  quietDay: false,
  currentState: {},
  lastComputed: "2026-09-16T00:00:00.000Z",
};

describe("/api/v1/feed — triggers are served, not restated", () => {
  beforeEach(() => {
    loadFeedResponse.mockReset();
    loadFeedResponse.mockResolvedValue(FEED);
  });

  it("carries the same frozen thresholds /methodology renders", async () => {
    const res = await GET(new Request("https://gawk.dev/api/v1/feed"));
    const body = await res.json();

    expect(body.triggers).toEqual(FEED_TRIGGERS);
    // The point of serving them: a client reading this never hard-codes a number.
    expect(body.triggers.MODEL_MOVER_RANK_DELTA).toBe(
      FEED_TRIGGERS.MODEL_MOVER_RANK_DELTA,
    );
    expect(Object.keys(body.triggers).sort()).toEqual(
      Object.keys(FEED_TRIGGERS).sort(),
    );
  });

  it("adds triggers without touching the rest of the response", async () => {
    const res = await GET(new Request("https://gawk.dev/api/v1/feed"));
    const body = await res.json();

    expect(body.cards).toEqual(FEED.cards);
    expect(body.quietDay).toBe(false);
    expect(body.lastComputed).toBe(FEED.lastComputed);
  });
});
