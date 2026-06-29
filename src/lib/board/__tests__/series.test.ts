import { describe, expect, it } from "vitest";
import { deriveBoardSeries } from "@/lib/board/series";
import type { DailySnapshot } from "@/lib/data/snapshot";

function snap(date: string, over: Partial<DailySnapshot> = {}): DailySnapshot {
  return {
    date,
    capturedAt: `${date}T00:00:00.000Z`,
    sources: { total: 0, verified: 0, pending: 0 },
    registry: null,
    events24h: null,
    tools: [],
    benchmarks: null,
    packages: null,
    labs24h: null,
    failures: [],
    ...over,
  };
}

describe("deriveBoardSeries", () => {
  it("sorts chronologically asc regardless of input order", () => {
    const s = deriveBoardSeries([
      snap("2026-06-03", { benchmarks: { publishDate: null, top3: [{ rank: 1, modelName: "c", organization: "o", rating: 30 }] } }),
      snap("2026-06-01", { benchmarks: { publishDate: null, top3: [{ rank: 1, modelName: "a", organization: "o", rating: 10 }] } }),
      snap("2026-06-02", { benchmarks: { publishDate: null, top3: [{ rank: 1, modelName: "b", organization: "o", rating: 20 }] } }),
    ]);
    expect(s.models).toEqual([10, 20, 30]);
  });

  it("models = top benchmark rating, null when no benchmarks captured", () => {
    const s = deriveBoardSeries([
      snap("2026-06-01"),
      snap("2026-06-02", { benchmarks: { publishDate: null, top3: [{ rank: 1, modelName: "x", organization: "o", rating: 1471 }] } }),
    ]);
    expect(s.models).toEqual([null, 1471]);
  });

  it("tools = count with zero active incidents; null when no tools captured", () => {
    const s = deriveBoardSeries([
      snap("2026-06-01", {
        tools: [
          { id: "a", status: "operational", activeIncidents: 0 },
          { id: "b", status: "degraded", activeIncidents: 2 },
          { id: "c", status: "operational", activeIncidents: 0 },
        ],
      }),
      snap("2026-06-02"), // no tools → null, not 0
    ]);
    expect(s.tools).toEqual([2, null]);
  });

  it("packages = summed weekly downloads; null when package store unreachable", () => {
    const s = deriveBoardSeries([
      snap("2026-06-01", {
        packages: {
          npm: [{ name: "a", lastWeek: 100 }, { name: "b", lastWeek: 50 }],
          pypi: [{ name: "c", lastWeek: 25 }],
        },
      }),
      snap("2026-06-02", { packages: null }), // unreachable → null
      snap("2026-06-03", { packages: {} }), // reachable but empty → null (no lastWeek anywhere)
    ]);
    expect(s.packages).toEqual([175, null, null]);
  });

  it("ignores package entries lacking a lastWeek window (no synthesis)", () => {
    const s = deriveBoardSeries([
      snap("2026-06-01", {
        packages: { crates: [{ name: "x", last90d: 999 }] }, // no lastWeek
      }),
    ]);
    expect(s.packages).toEqual([null]);
  });

  it("labs = summed 24h activity; null when labs fetch failed", () => {
    const s = deriveBoardSeries([
      snap("2026-06-01", {
        labs24h: [
          { id: "a", displayName: "A", kind: "labs", city: "", country: "", total: 7, byType: {}, stale: false },
          { id: "b", displayName: "B", kind: "labs", city: "", country: "", total: 3, byType: {}, stale: false },
        ],
      }),
      snap("2026-06-02", { labs24h: null }), // fetch failed → null
      snap("2026-06-03", { labs24h: [] }), // honest empty → 0
    ]);
    expect(s.labs).toEqual([10, null, 0]);
  });

  it("returns empty arrays for empty input", () => {
    expect(deriveBoardSeries([])).toEqual({
      models: [],
      tools: [],
      packages: [],
      labs: [],
    });
  });
});
