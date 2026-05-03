/**
 * globe-aggregate — pure aggregator + 24h window filter.
 * Pins the contract the snapshot cron + regional-deltas API depend on.
 */

import { describe, it, expect } from "vitest";
import {
  aggregateByRegion,
  filterTo24hWindow,
} from "@/lib/data/globe-aggregate";
import type { StoredGlobePoint } from "@/lib/data/globe-store";

const SF: [number, number] = [37.7749, -122.4194];
const LDN: [number, number] = [51.5074, -0.1278];

function pt(
  coords: [number, number],
  country: string | null,
  eventAtIso: string,
  id: string,
): StoredGlobePoint {
  return {
    lat: coords[0],
    lng: coords[1],
    color: "#fff",
    size: 0.5,
    eventAt: eventAtIso,
    eventId: id,
    sourceKind: "events-api",
    meta: { country, eventId: id },
  } as StoredGlobePoint;
}

describe("aggregateByRegion", () => {
  it("returns zeros for empty input", () => {
    expect(aggregateByRegion([])).toEqual({
      totalEvents: 0,
      unattributedEvents: 0,
      byCountry: {},
      byCity: {},
    });
  });

  it("groups by country + city when both labels exist", () => {
    const points = [
      pt(SF, "United States", "2026-05-03T20:00:00Z", "1"),
      pt(SF, "United States", "2026-05-03T20:01:00Z", "2"),
      pt(LDN, "United Kingdom", "2026-05-03T20:02:00Z", "3"),
    ];
    const agg = aggregateByRegion(points);
    expect(agg.totalEvents).toBe(3);
    expect(agg.unattributedEvents).toBe(0);
    expect(agg.byCountry).toEqual({
      "United States": 2,
      "United Kingdom": 1,
    });
    expect(agg.byCity).toEqual({
      "San Francisco": 2,
      London: 1,
    });
  });

  it("counts events with null country toward unattributed but not byCountry", () => {
    const points = [
      pt(SF, "United States", "2026-05-03T20:00:00Z", "1"),
      pt([0, 0], null, "2026-05-03T20:01:00Z", "2"),
    ];
    const agg = aggregateByRegion(points);
    expect(agg.totalEvents).toBe(2);
    expect(agg.unattributedEvents).toBe(1);
    expect(agg.byCountry).toEqual({ "United States": 1 });
  });

  it("byCity is independent of country attribution", () => {
    // City may resolve via cityFromCoords even when country isn't in
    // meta (e.g. legacy points before S56 country stamping).
    const points = [pt(SF, null, "2026-05-03T20:00:00Z", "1")];
    const agg = aggregateByRegion(points);
    expect(agg.byCity).toEqual({ "San Francisco": 1 });
    expect(agg.unattributedEvents).toBe(1);
  });
});

describe("filterTo24hWindow", () => {
  const NOW = new Date("2026-05-03T20:00:00Z");

  it("keeps events from the last 24h", () => {
    const points = [
      pt(SF, "US", "2026-05-03T19:00:00Z", "1"), // 1h ago
      pt(SF, "US", "2026-05-03T05:00:00Z", "2"), // 15h ago
      pt(SF, "US", "2026-05-02T21:00:00Z", "3"), // 23h ago
    ];
    expect(filterTo24hWindow(points, NOW)).toHaveLength(3);
  });

  it("drops events older than 24h", () => {
    const points = [
      pt(SF, "US", "2026-05-03T19:00:00Z", "fresh"),
      pt(SF, "US", "2026-05-02T19:00:00Z", "old"), // 25h ago
    ];
    const filtered = filterTo24hWindow(points, NOW);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].eventId).toBe("fresh");
  });

  it("drops malformed timestamps rather than including them ambiguously", () => {
    const points = [
      pt(SF, "US", "not-a-date", "bad"),
      pt(SF, "US", "2026-05-03T19:00:00Z", "good"),
    ];
    expect(filterTo24hWindow(points, NOW)).toHaveLength(1);
  });
});
