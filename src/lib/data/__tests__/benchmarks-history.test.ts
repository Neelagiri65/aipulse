import { describe, expect, it } from "vitest";
import { projectEloHistory } from "@/lib/data/benchmarks-history";
import type { DailySnapshot } from "@/lib/data/snapshot";

function makeSnapshot(
  date: string,
  rows: Array<{ rank: number; modelName: string; rating: number }>,
  opts: { useTop3Only?: boolean } = {},
): DailySnapshot {
  const projected = rows.map((r) => ({
    rank: r.rank,
    modelName: r.modelName,
    organization: "test-org",
    rating: r.rating,
  }));
  return {
    date,
    capturedAt: `${date}T04:00:00.000Z`,
    sources: { total: 0, verified: 0, pending: 0 },
    registry: null,
    events24h: null,
    tools: [],
    benchmarks: {
      publishDate: date,
      top3: projected.slice(0, 3),
      // Older snapshots predating S48g only have top3 — exercise that path.
      ...(opts.useTop3Only ? {} : { rows: projected }),
    },
    packages: null,
    labs24h: null,
    failures: [],
  };
}

describe("projectEloHistory", () => {
  it("returns empty result for empty input", () => {
    const out = projectEloHistory([]);
    expect(out.dates).toEqual([]);
    expect(out.byModel.size).toBe(0);
  });

  it("emits one entry per model seen across the window", () => {
    const out = projectEloHistory([
      makeSnapshot("2026-04-28", [
        { rank: 1, modelName: "kimi-k2.6", rating: 1400 },
        { rank: 2, modelName: "claude-sonnet-4.6", rating: 1395 },
      ]),
      makeSnapshot("2026-04-29", [
        { rank: 1, modelName: "kimi-k2.6", rating: 1402 },
        { rank: 2, modelName: "gpt-5", rating: 1390 },
      ]),
    ]);
    expect(out.dates).toEqual(["2026-04-28", "2026-04-29"]);
    expect(out.byModel.get("kimi-k2.6")).toEqual([1400, 1402]);
    // Sonnet appeared on day 1 only — day 2 must be null, NOT carried.
    expect(out.byModel.get("claude-sonnet-4.6")).toEqual([1395, null]);
    // GPT-5 appeared on day 2 only — day 1 must be null.
    expect(out.byModel.get("gpt-5")).toEqual([null, 1390]);
  });

  it("falls back to top3 when rows[] is absent (pre-S48g snapshots)", () => {
    const out = projectEloHistory([
      makeSnapshot(
        "2026-04-20",
        [
          { rank: 1, modelName: "kimi-k2.6", rating: 1400 },
          { rank: 2, modelName: "claude-sonnet-4.6", rating: 1395 },
          { rank: 3, modelName: "gpt-5", rating: 1390 },
          { rank: 4, modelName: "gemini-3", rating: 1385 },
        ],
        { useTop3Only: true },
      ),
    ]);
    // top3 fallback only sees the top three — gemini-3 is invisible.
    expect(out.byModel.has("kimi-k2.6")).toBe(true);
    expect(out.byModel.has("claude-sonnet-4.6")).toBe(true);
    expect(out.byModel.has("gpt-5")).toBe(true);
    expect(out.byModel.has("gemini-3")).toBe(false);
    expect(out.byModel.get("kimi-k2.6")).toEqual([1400]);
  });

  it("preserves oldest→newest ordering across the window", () => {
    const out = projectEloHistory([
      makeSnapshot("2026-04-27", [{ rank: 1, modelName: "x", rating: 1390 }]),
      makeSnapshot("2026-04-28", [{ rank: 1, modelName: "x", rating: 1395 }]),
      makeSnapshot("2026-04-29", [{ rank: 1, modelName: "x", rating: 1400 }]),
    ]);
    expect(out.byModel.get("x")).toEqual([1390, 1395, 1400]);
  });

  it("does NOT interpolate missing days — null stays null", () => {
    const out = projectEloHistory([
      makeSnapshot("2026-04-26", [{ rank: 1, modelName: "x", rating: 1390 }]),
      makeSnapshot("2026-04-27", []),
      makeSnapshot("2026-04-28", []),
      makeSnapshot("2026-04-29", [{ rank: 1, modelName: "x", rating: 1410 }]),
    ]);
    expect(out.byModel.get("x")).toEqual([1390, null, null, 1410]);
  });

  it("handles snapshots with null benchmarks block (collector failed that day)", () => {
    const goodDay = makeSnapshot("2026-04-29", [
      { rank: 1, modelName: "x", rating: 1400 },
    ]);
    const badDay: DailySnapshot = {
      ...goodDay,
      date: "2026-04-28",
      benchmarks: null,
    };
    const out = projectEloHistory([badDay, goodDay]);
    expect(out.dates).toEqual(["2026-04-28", "2026-04-29"]);
    expect(out.byModel.get("x")).toEqual([null, 1400]);
  });
});
