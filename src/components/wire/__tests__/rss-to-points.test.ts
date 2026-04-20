import { describe, expect, it } from "vitest";
import {
  rssToGlobePoints,
  RSS_AMBER,
  RSS_STALE_GREY,
  RSS_MIN_SIZE,
  RSS_MAX_SIZE,
  RSS_INACTIVE_OPACITY,
} from "@/components/wire/rss-to-points";
import type { RssSourcePanel } from "@/lib/data/wire-rss";

function mkSrc(
  id: string,
  itemsLast24h: number,
  overrides: Partial<RssSourcePanel> = {},
): RssSourcePanel {
  return {
    id,
    displayName: `${id} publisher`,
    city: "Nowhere",
    country: "XX",
    lat: 12.34,
    lng: 56.78,
    lang: "en",
    hqSourceUrl: "https://example.com",
    feedFormat: "rss",
    keywordFilterScope: "all",
    itemsLast24h,
    itemsLast7d: itemsLast24h,
    recentItems: [],
    lastFetchOkTs: new Date().toISOString(),
    lastError: null,
    staleHours: 1,
    stale: false,
    ...overrides,
  };
}

describe("rssToGlobePoints", () => {
  it("returns an empty array for an empty input", () => {
    expect(rssToGlobePoints([])).toEqual([]);
  });

  it("colours fresh sources amber", () => {
    const pts = rssToGlobePoints([mkSrc("a", 5), mkSrc("b", 0)]);
    expect(pts.every((p) => p.color === RSS_AMBER)).toBe(true);
  });

  it("colours stale sources grey instead of amber", () => {
    const pts = rssToGlobePoints([
      mkSrc("a", 5),
      mkSrc("b", 5, { stale: true, staleHours: 48 }),
    ]);
    const b = pts.find((p) => (p.meta as { rssSourceId?: string }).rssSourceId === "b")!;
    expect(b.color).toBe(RSS_STALE_GREY);
  });

  it("marks kind='rss' on every point's meta", () => {
    const [p] = rssToGlobePoints([mkSrc("a", 10)]);
    expect(p.meta).toMatchObject({ kind: "rss", rssSourceId: "a" });
  });

  it("zero-activity source clamps to minSize and flags rssInactive", () => {
    const pts = rssToGlobePoints([mkSrc("a", 0), mkSrc("b", 50)]);
    const a = pts.find((p) => (p.meta as { rssSourceId?: string }).rssSourceId === "a")!;
    expect(a.size).toBeCloseTo(RSS_MIN_SIZE, 5);
    expect((a.meta as { rssInactive?: boolean }).rssInactive).toBe(true);
  });

  it("p95-clamps outliers so one spike doesn't squash the rest", () => {
    const big = mkSrc("huge", 10000);
    const smalls = Array.from({ length: 10 }, (_, i) => mkSrc(`s${i}`, 3));
    const pts = rssToGlobePoints([big, ...smalls]);
    const hugePt = pts.find(
      (p) => (p.meta as { rssSourceId?: string }).rssSourceId === "huge",
    )!;
    expect(hugePt.size).toBeLessThanOrEqual(RSS_MAX_SIZE + 1e-6);
    expect(hugePt.size).toBeGreaterThanOrEqual(RSS_MAX_SIZE - 1e-6);
  });

  it("active sources render larger than inactive ones", () => {
    const pts = rssToGlobePoints([mkSrc("a", 0), mkSrc("b", 10)]);
    const a = pts.find((p) => (p.meta as { rssSourceId?: string }).rssSourceId === "a")!;
    const b = pts.find((p) => (p.meta as { rssSourceId?: string }).rssSourceId === "b")!;
    expect(b.size! > a.size!).toBe(true);
  });

  it("preserves lat/lng verbatim from the source", () => {
    const [p] = rssToGlobePoints([
      mkSrc("a", 1, { lat: 51.5074, lng: -0.1278 }),
    ]);
    expect(p.lat).toBe(51.5074);
    expect(p.lng).toBe(-0.1278);
  });

  it("is deterministic across repeated calls with the same input", () => {
    const srcs = [mkSrc("a", 5), mkSrc("b", 40), mkSrc("c", 0)];
    expect(rssToGlobePoints(srcs)).toEqual(rssToGlobePoints(srcs));
  });

  it("exposes the canonical constants", () => {
    expect(RSS_AMBER).toBe("#f97316");
    expect(RSS_STALE_GREY).toBe("#64748b");
    expect(RSS_MIN_SIZE).toBeGreaterThan(0);
    expect(RSS_MAX_SIZE).toBeGreaterThan(RSS_MIN_SIZE);
    expect(RSS_INACTIVE_OPACITY).toBeGreaterThan(0);
    expect(RSS_INACTIVE_OPACITY).toBeLessThan(1);
  });
});
