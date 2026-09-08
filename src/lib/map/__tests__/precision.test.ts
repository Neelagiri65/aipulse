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
