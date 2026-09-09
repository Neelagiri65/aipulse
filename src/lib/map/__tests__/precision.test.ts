import { describe, it, expect } from "vitest";
import { splitByPrecision } from "@/lib/map/precision";
import type { GlobePoint } from "@/components/globe/Globe";

const point = (
  lat: number,
  lng: number,
  precision?: string,
  extra: Record<string, unknown> = {},
): GlobePoint => ({
  lat,
  lng,
  color: "#fff",
  meta: { kind: "event", ...(precision ? { precision } : {}), ...extra },
});

describe("splitByPrecision", () => {
  it("keeps city placements as individual points", () => {
    const pts = [point(52.52, 13.405, "city"), point(47.6062, -122.3321, "city")];
    const split = splitByPrecision(pts);
    expect(split.precise).toHaveLength(2);
    expect(split.impreciseCount).toBe(0);
    expect(split.impreciseByCoord.size).toBe(0);
  });

  it("collapses a country centroid pile into one bucket with its count", () => {
    // The live map had 102 events on Germany's centroid, drawn as 102 dots.
    const pts = Array.from({ length: 102 }, () => point(51.17, 10.45, "country"));
    const split = splitByPrecision(pts);
    expect(split.precise).toHaveLength(0);
    expect(split.impreciseByCoord.size).toBe(1);
    expect(split.impreciseByCoord.get("51.17,10.45")).toHaveLength(102);
    expect(split.impreciseCount).toBe(102);
  });

  it("keeps different centroids apart", () => {
    const split = splitByPrecision([
      point(51.17, 10.45, "country"),
      point(56.13, -106.35, "country"),
      point(36.7783, -119.4179, "region"),
    ]);
    expect(split.impreciseByCoord.size).toBe(3);
    expect(split.impreciseCount).toBe(3);
  });

  it("treats an ungraded point as precise rather than casting doubt on it", () => {
    // Curated HQs (labs, RSS publishers) carry no precision field and are
    // exact by construction; a missing grade must not turn them into rings.
    const split = splitByPrecision([point(37.7749, -122.4194, undefined, { kind: "lab" })]);
    expect(split.precise).toHaveLength(1);
    expect(split.impreciseCount).toBe(0);
  });
});

describe("imprecise ink", () => {
  it("is never an event-type colour — a ring makes no claim about type", async () => {
    const { impreciseInk, legendColors } = await import(
      "@/components/map/event-palette"
    );
    for (const theme of ["light", "dark"] as const) {
      const ink = impreciseInk(theme);
      const legend = Object.values(legendColors(theme));
      // The ring holds events of mixed types. Colouring it by the first one in
      // the array would have the legend teaching "blue = push" while a blue
      // ring only meant "the first of these 102 events was a push".
      expect(legend).not.toContain(ink);
    }
  });
});

/**
 * The denominator behind "Now X% of placed events" on the map legend.
 *
 * `impreciseCount` can only ever come from placed EVENTS — the curated-HQ
 * layers (registry, labs, regional RSS, HN) carry no band, so they always land
 * in `precise`. Dividing by every marker therefore diluted the disclosed
 * share. Measured on a real payload driven through the built map: 156
 * imprecise events among 215 all-layer marks displayed **73%** when the true
 * share of placed events was **100%**.
 *
 * An honesty number that understates is worse than one that overstates, so the
 * denominator is pinned here.
 */
describe("splitByPrecision — eventTotal is the legend's denominator", () => {
  const event = (precision: string | undefined, id: string) => ({
    lat: 51.17,
    lng: 10.45,
    color: "#fff",
    size: 0.4,
    meta: { eventId: id, precision },
  });
  const curatedHq = (id: string) => ({
    lat: 52.52,
    lng: 13.405,
    color: "#fff",
    size: 0.4,
    meta: { kind: "registry", fullName: id },
  });

  it("counts only placed events, never the curated-HQ layers", () => {
    const points = [
      event("country", "e1"),
      event("country", "e2"),
      event("city", "e3"),
      curatedHq("r1"),
      curatedHq("r2"),
    ] as unknown as Parameters<typeof splitByPrecision>[0];

    const split = splitByPrecision(points);

    expect(split.impreciseCount).toBe(2);
    // 3, not 5: the two registry HQs are not placed events.
    expect(split.eventTotal).toBe(3);
    // The share the legend states.
    expect(Math.round((split.impreciseCount / split.eventTotal) * 100)).toBe(67);
  });

  it("reports 100% when every placed event is an area", () => {
    // The real-payload case: all events on national centroids, plus HQ layers.
    const points = [
      event("country", "e1"),
      event("country", "e2"),
      curatedHq("r1"),
    ] as unknown as Parameters<typeof splitByPrecision>[0];

    const split = splitByPrecision(points);

    expect(split.eventTotal).toBe(2);
    expect(split.impreciseCount / split.eventTotal).toBe(1);
    // Dividing by points.length would have reported 67% here.
  });
});
