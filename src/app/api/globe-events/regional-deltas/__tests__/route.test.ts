/**
 * /api/globe-events/regional-deltas — read endpoint that joins the
 * current 24h LRANGE with yesterday's snapshot for delta computation.
 *
 * Pins the contract the dashboard depends on: deltas only when both
 * windows have data; null deltas when prior=0 (rendered "+new" in UI);
 * topGrowingCountry filtered by MIN_PRIOR_FOR_GROWTH_RANKING so tiny
 * denominators don't dominate.
 */

import { describe, it, expect, vi } from "vitest";
import { handleGetRegionalDeltas } from "@/app/api/globe-events/regional-deltas/route";
import type {
  RegionalSnapshot,
  StoredGlobePoint,
} from "@/lib/data/globe-store";

const NOW = new Date("2026-05-04T08:00:00Z");

const SF: [number, number] = [37.7749, -122.4194];
const LDN: [number, number] = [51.5074, -0.1278];
const BLR: [number, number] = [12.9716, 77.5946];

function pt(
  coords: [number, number],
  country: string | null,
  iso: string,
  id: string,
): StoredGlobePoint {
  return {
    lat: coords[0],
    lng: coords[1],
    color: "#fff",
    size: 0.5,
    eventAt: iso,
    eventId: id,
    sourceKind: "events-api",
    meta: { country, eventId: id },
  } as StoredGlobePoint;
}

function snap(byCountry: Record<string, number>): RegionalSnapshot {
  return {
    date: "2026-05-03",
    generatedAt: "2026-05-04T00:05:00Z",
    totalEvents: Object.values(byCountry).reduce((a, b) => a + b, 0),
    unattributedEvents: 0,
    byCountry,
    byCity: {},
  };
}

describe("handleGetRegionalDeltas", () => {
  it("returns 5-min cache header when data is present", async () => {
    const result = await handleGetRegionalDeltas({
      readWindow: async () => [],
      readSnapshot: async () => null,
      now: () => NOW,
    });
    expect(result.cacheHeader).toBe(
      "public, s-maxage=300, stale-while-revalidate=60",
    );
    expect(result.dto.windowHours).toBe(24);
  });

  it("computes byCountry delta from current 24h vs yesterday's snapshot", async () => {
    const result = await handleGetRegionalDeltas({
      readWindow: async () => [
        pt(SF, "United States", "2026-05-04T05:00:00Z", "1"),
        pt(SF, "United States", "2026-05-04T06:00:00Z", "2"),
        pt(LDN, "United Kingdom", "2026-05-04T07:00:00Z", "3"),
      ],
      readSnapshot: async () =>
        snap({ "United States": 10, "United Kingdom": 4 }),
      now: () => NOW,
    });
    expect(result.dto.byCountry["United States"]).toEqual({
      current24h: 2,
      prior24h: 10,
      deltaPct: -80,
    });
    expect(result.dto.byCountry["United Kingdom"]).toEqual({
      current24h: 1,
      prior24h: 4,
      deltaPct: -75,
    });
  });

  it("country in prior but not current → current24h=0, deltaPct=-100", () => {
    return handleGetRegionalDeltas({
      readWindow: async () => [],
      readSnapshot: async () => snap({ "United States": 10 }),
      now: () => NOW,
    }).then((result) => {
      expect(result.dto.byCountry["United States"]).toEqual({
        current24h: 0,
        prior24h: 10,
        deltaPct: -100,
      });
    });
  });

  it("country in current but not prior → deltaPct=null (rendered as '+new' in UI)", async () => {
    const result = await handleGetRegionalDeltas({
      readWindow: async () => [pt(BLR, "India", "2026-05-04T05:00:00Z", "1")],
      readSnapshot: async () => snap({ "United States": 10 }),
      now: () => NOW,
    });
    expect(result.dto.byCountry["India"]).toEqual({
      current24h: 1,
      prior24h: null,
      deltaPct: null,
    });
  });

  it("topGrowingCountry picks the highest deltaPct among countries with prior >= MIN", async () => {
    const result = await handleGetRegionalDeltas({
      readWindow: async () => [
        // India: 30 events vs 5 prior = +500%
        ...Array.from({ length: 30 }, (_, i) =>
          pt(BLR, "India", "2026-05-04T07:00:00Z", `i${i}`),
        ),
        // US: 12 events vs 10 prior = +20%
        ...Array.from({ length: 12 }, (_, i) =>
          pt(SF, "United States", "2026-05-04T07:00:00Z", `u${i}`),
        ),
      ],
      readSnapshot: async () =>
        snap({ India: 5, "United States": 10 }),
      now: () => NOW,
    });
    expect(result.dto.topGrowingCountry?.country).toBe("India");
    expect(result.dto.topGrowingCountry?.deltaPct).toBe(500);
  });

  it("topGrowingCountry skips countries with prior < MIN_PRIOR_FOR_GROWTH_RANKING (avoid tiny-denominator noise)", async () => {
    const result = await handleGetRegionalDeltas({
      readWindow: async () => [
        // India: 100 events vs 1 prior = +9900% but prior < MIN
        ...Array.from({ length: 100 }, (_, i) =>
          pt(BLR, "India", "2026-05-04T07:00:00Z", `i${i}`),
        ),
        // US: 12 events vs 10 prior = +20%
        ...Array.from({ length: 12 }, (_, i) =>
          pt(SF, "United States", "2026-05-04T07:00:00Z", `u${i}`),
        ),
      ],
      readSnapshot: async () =>
        snap({ India: 1, "United States": 10 }),
      now: () => NOW,
    });
    // India has the bigger delta but its prior=1 is below MIN; US wins.
    expect(result.dto.topGrowingCountry?.country).toBe("United States");
  });

  it("topGrowingCountry is null on bootstrap (no prior snapshot exists)", async () => {
    const result = await handleGetRegionalDeltas({
      readWindow: async () => [pt(SF, "United States", "2026-05-04T05:00:00Z", "1")],
      readSnapshot: async () => null,
      now: () => NOW,
    });
    expect(result.dto.topGrowingCountry).toBeNull();
  });

  it("mostActiveCity picks the city with the most current-24h events", async () => {
    const result = await handleGetRegionalDeltas({
      readWindow: async () => [
        pt(SF, "United States", "2026-05-04T05:00:00Z", "1"),
        pt(SF, "United States", "2026-05-04T06:00:00Z", "2"),
        pt(LDN, "United Kingdom", "2026-05-04T07:00:00Z", "3"),
      ],
      readSnapshot: async () => null,
      now: () => NOW,
    });
    expect(result.dto.mostActiveCity).toEqual({
      city: "San Francisco",
      count: 2,
    });
  });

  it("filters the LRANGE to last 24h before aggregating (events older than 24h excluded)", async () => {
    const result = await handleGetRegionalDeltas({
      readWindow: async () => [
        pt(SF, "United States", "2026-05-04T05:00:00Z", "fresh"),
        pt(SF, "United States", "2026-05-03T05:00:00Z", "stale-by-3h"),
      ],
      readSnapshot: async () => null,
      now: () => NOW,
    });
    expect(result.dto.byCountry["United States"]?.current24h).toBe(1);
  });
});
