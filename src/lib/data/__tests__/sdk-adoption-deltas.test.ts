import { describe, expect, it } from "vitest";
import {
  deltasFromCounts,
  type CountByDate,
} from "@/lib/data/sdk-adoption-deltas";

/**
 * Pure delta math for the SDK Adoption matrix. Each cell is the
 * within-package % delta of "today's count" vs the trailing
 * baselineWindow's mean. Nulls cascade — never invented numbers.
 */
describe("deltasFromCounts", () => {
  it("returns [] for empty input", () => {
    expect(deltasFromCounts([])).toEqual([]);
  });

  it("returns null delta on the first day (no baseline yet)", () => {
    const input: CountByDate[] = [{ date: "2026-04-01", count: 100 }];
    expect(deltasFromCounts(input)).toEqual([
      { date: "2026-04-01", count: 100, delta: null },
    ]);
  });

  it("computes delta from prior days when baseline available", () => {
    const input: CountByDate[] = [
      { date: "2026-04-01", count: 100 },
      { date: "2026-04-02", count: 110 },
    ];
    const out = deltasFromCounts(input, 30);
    expect(out[0]).toEqual({ date: "2026-04-01", count: 100, delta: null });
    expect(out[1].count).toBe(110);
    expect(out[1].delta).toBeCloseTo(0.1, 6); // (110 - 100) / 100
  });

  it("returns 0 delta when count equals baseline", () => {
    const input: CountByDate[] = [
      { date: "d1", count: 50 },
      { date: "d2", count: 50 },
    ];
    expect(deltasFromCounts(input)[1].delta).toBe(0);
  });

  it("handles negative deltas", () => {
    const input: CountByDate[] = [
      { date: "d1", count: 200 },
      { date: "d2", count: 100 },
    ];
    expect(deltasFromCounts(input)[1].delta).toBeCloseTo(-0.5, 6);
  });

  it("returns null delta when baseline mean is zero", () => {
    const input: CountByDate[] = [
      { date: "d1", count: 0 },
      { date: "d2", count: 0 },
      { date: "d3", count: 5 },
    ];
    expect(deltasFromCounts(input)[2].delta).toBeNull();
  });

  it("excludes null counts from the baseline window", () => {
    const input: CountByDate[] = [
      { date: "d1", count: 100 },
      { date: "d2", count: null },
      { date: "d3", count: 200 },
      { date: "d4", count: 150 },
    ];
    const out = deltasFromCounts(input);
    // baseline for d4 = mean(100, null→excluded, 200) = 150 → delta 0
    expect(out[3].delta).toBe(0);
  });

  it("preserves null count entries with null delta", () => {
    const input: CountByDate[] = [
      { date: "d1", count: 100 },
      { date: "d2", count: null },
    ];
    const out = deltasFromCounts(input);
    expect(out[1]).toEqual({ date: "d2", count: null, delta: null });
  });

  it("returns null delta when baseline window has no non-null counts", () => {
    const input: CountByDate[] = [
      { date: "d1", count: null },
      { date: "d2", count: null },
      { date: "d3", count: 50 },
    ];
    expect(deltasFromCounts(input)[2].delta).toBeNull();
  });

  it("respects baselineWindow size — only the prior N days count", () => {
    const counts: CountByDate[] = [];
    // 35 days of count=10 then one day of count=20
    for (let i = 0; i < 35; i++) counts.push({ date: `d${i}`, count: 10 });
    counts.push({ date: "today", count: 20 });
    const out = deltasFromCounts(counts, 30);
    // baseline = mean of last 30 days = 10, delta = (20-10)/10 = 1.0
    expect(out[35].delta).toBeCloseTo(1.0, 6);
  });

  it("preserves input order (input[i].date === output[i].date)", () => {
    const input: CountByDate[] = [
      { date: "2026-04-01", count: 1 },
      { date: "2026-04-02", count: 2 },
      { date: "2026-04-03", count: 3 },
    ];
    const out = deltasFromCounts(input);
    expect(out.map((o) => o.date)).toEqual([
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
    ]);
  });

  it("all-null input returns all-null deltas, length preserved", () => {
    const input: CountByDate[] = [
      { date: "d1", count: null },
      { date: "d2", count: null },
    ];
    const out = deltasFromCounts(input);
    expect(out).toHaveLength(2);
    expect(out.every((d) => d.delta === null)).toBe(true);
  });
});
