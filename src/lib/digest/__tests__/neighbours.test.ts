import { describe, expect, it } from "vitest";
import { digestNeighbours, groupDigestDatesByMonth } from "@/lib/digest/neighbours";

const DATES = ["2026-09-11", "2026-09-10", "2026-09-08", "2026-08-31"]; // newest first, one gap

describe("digestNeighbours", () => {
  it("middle date: prev is the older issue, next the newer, gaps skipped", () => {
    expect(digestNeighbours(DATES, "2026-09-10")).toEqual({ prev: "2026-09-08", next: "2026-09-11" });
    expect(digestNeighbours(DATES, "2026-09-08")).toEqual({ prev: "2026-08-31", next: "2026-09-10" });
  });
  it("newest has no next, oldest has no prev", () => {
    expect(digestNeighbours(DATES, "2026-09-11")).toEqual({ prev: "2026-09-10", next: null });
    expect(digestNeighbours(DATES, "2026-08-31")).toEqual({ prev: null, next: "2026-09-08" });
  });
  it("is independent of the input order", () => {
    expect(digestNeighbours([...DATES].reverse(), "2026-09-10")).toEqual(digestNeighbours(DATES, "2026-09-10"));
  });
  it("empty archive → no neighbours", () => {
    expect(digestNeighbours([], "2026-09-10")).toEqual({ prev: null, next: null });
  });
  it("a date not in the archive still gets the surrounding issues", () => {
    expect(digestNeighbours(DATES, "2026-09-09")).toEqual({ prev: "2026-09-08", next: "2026-09-10" });
  });
});

describe("groupDigestDatesByMonth", () => {
  it("groups newest month first, newest date first within a month, dedupes", () => {
    expect(groupDigestDatesByMonth([...DATES, "2026-09-10"])).toEqual([
      { month: "2026-09", dates: ["2026-09-11", "2026-09-10", "2026-09-08"] },
      { month: "2026-08", dates: ["2026-08-31"] },
    ]);
  });
  it("empty → empty", () => {
    expect(groupDigestDatesByMonth([])).toEqual([]);
  });
});
