import { describe, expect, it } from "vitest";
import { topCategoryCounts, topCountryCounts } from "../panel-stats";

describe("topCategoryCounts", () => {
  it("returns empty array when given empty input", () => {
    expect(topCategoryCounts([], (x: { c: string }) => x.c)).toEqual([]);
  });

  it("counts and sorts by descending count", () => {
    const items = [
      { c: "a" },
      { c: "b" },
      { c: "a" },
      { c: "c" },
      { c: "a" },
      { c: "b" },
    ];
    expect(topCategoryCounts(items, (x) => x.c)).toEqual([
      { key: "a", count: 3 },
      { key: "b", count: 2 },
      { key: "c", count: 1 },
    ]);
  });

  it("breaks ties alphabetically so output is deterministic", () => {
    const items = [{ c: "z" }, { c: "a" }, { c: "m" }];
    // All counts == 1; expect alphabetical order.
    expect(topCategoryCounts(items, (x) => x.c)).toEqual([
      { key: "a", count: 1 },
      { key: "m", count: 1 },
      { key: "z", count: 1 },
    ]);
  });

  it("respects the limit parameter", () => {
    const items = [
      { c: "a" },
      { c: "b" },
      { c: "c" },
      { c: "d" },
      { c: "e" },
    ];
    expect(topCategoryCounts(items, (x) => x.c, 2)).toEqual([
      { key: "a", count: 1 },
      { key: "b", count: 1 },
    ]);
  });

  it("ignores items whose key extractor returns null/undefined/empty", () => {
    const items = [
      { c: "a" },
      { c: null as unknown as string },
      { c: "" },
      { c: undefined as unknown as string },
      { c: "a" },
    ];
    expect(topCategoryCounts(items, (x) => x.c)).toEqual([
      { key: "a", count: 2 },
    ]);
  });
});

describe("topCountryCounts", () => {
  it("aggregates by country with default limit of 5", () => {
    const labs = [
      { country: "US" },
      { country: "CN" },
      { country: "US" },
      { country: "GB" },
      { country: "CN" },
      { country: "US" },
      { country: "FR" },
      { country: "DE" },
      { country: "IL" },
    ];
    expect(topCountryCounts(labs)).toEqual([
      { key: "US", count: 3 },
      { key: "CN", count: 2 },
      { key: "DE", count: 1 },
      { key: "FR", count: 1 },
      { key: "GB", count: 1 },
    ]);
  });

  it("returns empty array on empty input", () => {
    expect(topCountryCounts([])).toEqual([]);
  });
});
