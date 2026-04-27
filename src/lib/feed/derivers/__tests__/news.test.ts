import { describe, expect, it } from "vitest";
import { deriveNewsCards } from "@/lib/feed/derivers/news";
import type { HnWireItem, HnWireResult } from "@/lib/data/wire-hn";

function item(
  partial: Partial<HnWireItem> & Pick<HnWireItem, "id" | "points" | "createdAtI">,
): HnWireItem {
  return {
    id: partial.id,
    title: partial.title ?? "Show HN: a thing",
    url: partial.url ?? null,
    author: partial.author ?? "user",
    points: partial.points,
    numComments: partial.numComments ?? 0,
    createdAtI: partial.createdAtI,
    createdAt:
      partial.createdAt ??
      new Date(partial.createdAtI * 1000).toISOString(),
    firstSeenTs: partial.firstSeenTs ?? new Date().toISOString(),
    lastRefreshTs: partial.lastRefreshTs ?? new Date().toISOString(),
    kind: "hn",
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    locationLabel: partial.locationLabel ?? null,
  };
}

const NOW = new Date("2026-04-27T12:00:00.000Z").getTime();
const ONE_HOUR = 60 * 60 * 1000;
const ONE_HOUR_S = 60 * 60;

const baseResult: HnWireResult = {
  ok: true,
  items: [],
  points: [],
  polledAt: "2026-04-27T12:00:00.000Z",
  coverage: { itemsTotal: 0, itemsWithLocation: 0, geocodeResolutionPct: 0 },
  meta: { lastFetchOkTs: null, staleMinutes: null },
  source: "redis",
};

describe("deriveNewsCards", () => {
  it("does NOT fire when points === 100 (boundary, threshold is strictly greater)", () => {
    const result: HnWireResult = {
      ...baseResult,
      items: [item({ id: "1", points: 100, createdAtI: NOW / 1000 - ONE_HOUR_S })],
    };
    expect(deriveNewsCards(result, NOW)).toEqual([]);
  });

  it("fires when points === 101", () => {
    const result: HnWireResult = {
      ...baseResult,
      items: [item({ id: "1", points: 101, createdAtI: NOW / 1000 - ONE_HOUR_S })],
    };
    const cards = deriveNewsCards(result, NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0].severity).toBe(40);
    expect(cards[0].type).toBe("NEWS");
  });

  it("does NOT fire when story is older than 6h", () => {
    const result: HnWireResult = {
      ...baseResult,
      items: [
        item({
          id: "1",
          points: 500,
          createdAtI: NOW / 1000 - 7 * ONE_HOUR_S, // 7h old
        }),
      ],
    };
    expect(deriveNewsCards(result, NOW)).toEqual([]);
  });

  it("links to the HN item page using id", () => {
    const result: HnWireResult = {
      ...baseResult,
      items: [
        item({
          id: "39426255",
          title: "Show HN: cool thing",
          points: 250,
          createdAtI: NOW / 1000 - ONE_HOUR_S,
        }),
      ],
    };
    const cards = deriveNewsCards(result, NOW);
    expect(cards[0].sourceUrl).toBe(
      "https://news.ycombinator.com/item?id=39426255",
    );
    expect(cards[0].sourceName).toContain("Hacker News");
  });

  it("uses createdAt as the card timestamp", () => {
    const result: HnWireResult = {
      ...baseResult,
      items: [
        item({
          id: "1",
          points: 200,
          createdAtI: NOW / 1000 - ONE_HOUR_S,
          createdAt: "2026-04-27T11:00:00.000Z",
        }),
      ],
    };
    const cards = deriveNewsCards(result, NOW);
    expect(cards[0].timestamp).toBe("2026-04-27T11:00:00.000Z");
  });

  it("returns [] on empty items", () => {
    expect(deriveNewsCards(baseResult, NOW)).toEqual([]);
  });
});
