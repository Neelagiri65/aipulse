import { describe, expect, it } from "vitest";
import { composeHnSection } from "@/lib/digest/sections/hn";
import type { HnWireItem, HnWireResult } from "@/lib/data/wire-hn";

function mkItem(overrides: Partial<HnWireItem>): HnWireItem {
  return {
    kind: "hn",
    id: "1",
    title: "Default",
    url: null,
    author: "u",
    points: 0,
    numComments: 0,
    createdAtI: 0,
    createdAt: "2026-04-22T00:00:00Z",
    firstSeenTs: "2026-04-22T00:00:00Z",
    lastRefreshTs: "2026-04-22T00:00:00Z",
    lat: null,
    lng: null,
    locationLabel: null,
    ...overrides,
  };
}

function mkWire(items: HnWireItem[]): HnWireResult {
  return {
    ok: true,
    items,
    points: [],
    polledAt: "2026-04-22T00:00:00Z",
    coverage: { itemsTotal: items.length, itemsWithLocation: 0, geocodeResolutionPct: 0 },
    meta: { lastFetchOkTs: null, staleMinutes: null },
    source: "redis",
  };
}

describe("composeHnSection", () => {
  it("always returns mode='diff' even with zero items", () => {
    const sec = composeHnSection({ hn: mkWire([]) });
    expect(sec.mode).toBe("diff");
    expect(sec.items).toHaveLength(0);
  });

  it("sorts by points descending and caps at topN", () => {
    const sec = composeHnSection({
      hn: mkWire([
        mkItem({ id: "a", title: "A", points: 10 }),
        mkItem({ id: "b", title: "B", points: 100 }),
        mkItem({ id: "c", title: "C", points: 50 }),
      ]),
      topN: 2,
    });
    expect(sec.items.map((i) => i.headline)).toEqual(["B", "C"]);
  });

  it("emits a news.ycombinator item link in sourceUrl", () => {
    const sec = composeHnSection({
      hn: mkWire([mkItem({ id: "42", title: "T", points: 1 })]),
    });
    expect(sec.items[0].sourceUrl).toBe(
      "https://news.ycombinator.com/item?id=42",
    );
  });

  it("includes the location label in detail when present", () => {
    const sec = composeHnSection({
      hn: mkWire([
        mkItem({ id: "1", title: "T", points: 1, numComments: 2, locationLabel: "London" }),
      ]),
    });
    expect(sec.items[0].detail).toContain("London");
  });

  it("defaults to top 5", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      mkItem({ id: String(i), title: `T${i}`, points: i }),
    );
    const sec = composeHnSection({ hn: mkWire(items) });
    expect(sec.items).toHaveLength(5);
  });

  it("cites the HN domain in sourceUrls", () => {
    const sec = composeHnSection({ hn: mkWire([]) });
    expect(sec.sourceUrls).toContain("https://news.ycombinator.com/");
  });
});
