import { describe, expect, it } from "vitest";
import type { LabActivity } from "@/lib/data/fetch-labs";
import {
  labsToGlobePoints,
  LABS_VIOLET,
  LABS_MIN_SIZE,
  LABS_MAX_SIZE,
  LABS_INACTIVE_OPACITY,
} from "@/components/labs/labs-to-points";

function makeLab(id: string, total: number): LabActivity {
  return {
    id,
    displayName: id,
    kind: "industry",
    city: "City",
    country: "US",
    lat: 0,
    lng: 0,
    hqSourceUrl: "https://example.com",
    orgs: [],
    repos: [],
    total,
    byType: total > 0 ? { PushEvent: total } : {},
    stale: false,
  };
}

describe("labsToGlobePoints", () => {
  it("returns an empty array for an empty input", () => {
    expect(labsToGlobePoints([])).toEqual([]);
  });

  it("colours every point the labs violet", () => {
    const points = labsToGlobePoints([
      makeLab("a", 0),
      makeLab("b", 100),
    ]);
    expect(points.every((p) => p.color === LABS_VIOLET)).toBe(true);
  });

  it("marks kind='lab' on every point's meta", () => {
    const points = labsToGlobePoints([makeLab("a", 10)]);
    expect(points[0].meta).toMatchObject({ kind: "lab", labId: "a" });
  });

  it("zero-activity lab clamps to minSize", () => {
    const points = labsToGlobePoints([makeLab("a", 0), makeLab("b", 200)]);
    const zero = points.find((p) => (p.meta as { labId?: string })?.labId === "a")!;
    expect(zero.size).toBeCloseTo(LABS_MIN_SIZE, 5);
  });

  it("clamps outliers to maxSize (1 huge lab + small others)", () => {
    const labs = [
      makeLab("huge", 10000),
      ...Array.from({ length: 10 }, (_, i) => makeLab(`small${i}`, 5)),
    ];
    const points = labsToGlobePoints(labs);
    const huge = points.find((p) => (p.meta as { labId?: string })?.labId === "huge")!;
    // The p95 across 11 labs is well below 10000 → huge is clamped to MAX.
    expect(huge.size).toBeLessThanOrEqual(LABS_MAX_SIZE + 1e-6);
    expect(huge.size).toBeGreaterThanOrEqual(LABS_MAX_SIZE - 1e-6);
  });

  it("active labs have size strictly greater than zero-activity labs", () => {
    const points = labsToGlobePoints([makeLab("a", 0), makeLab("b", 10)]);
    const a = points.find((p) => (p.meta as { labId?: string })?.labId === "a")!;
    const b = points.find((p) => (p.meta as { labId?: string })?.labId === "b")!;
    expect(b.size! > a.size!).toBe(true);
  });

  it("tags zero-activity labs with labInactive=true in meta", () => {
    const points = labsToGlobePoints([makeLab("a", 0), makeLab("b", 10)]);
    const a = points.find((p) => (p.meta as { labId?: string })?.labId === "a")!;
    const b = points.find((p) => (p.meta as { labId?: string })?.labId === "b")!;
    expect((a.meta as { labInactive?: boolean }).labInactive).toBe(true);
    expect((b.meta as { labInactive?: boolean }).labInactive).toBe(false);
  });

  it("is deterministic across repeated calls with the same input", () => {
    const labs = [makeLab("a", 5), makeLab("b", 200), makeLab("c", 0)];
    const p1 = labsToGlobePoints(labs);
    const p2 = labsToGlobePoints(labs);
    expect(p1).toEqual(p2);
  });

  it("preserves lat/lng verbatim from the LabActivity input", () => {
    const lab: LabActivity = {
      ...makeLab("a", 10),
      lat: 37.7749,
      lng: -122.4194,
    };
    const [p] = labsToGlobePoints([lab]);
    expect(p.lat).toBe(37.7749);
    expect(p.lng).toBe(-122.4194);
  });

  it("exposes the canonical constants", () => {
    expect(LABS_VIOLET).toBe("#a855f7");
    expect(LABS_MIN_SIZE).toBeGreaterThan(0);
    expect(LABS_MAX_SIZE).toBeGreaterThan(LABS_MIN_SIZE);
    expect(LABS_INACTIVE_OPACITY).toBeGreaterThan(0);
    expect(LABS_INACTIVE_OPACITY).toBeLessThan(1);
  });
});
