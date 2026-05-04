import { describe, expect, it } from "vitest";
import {
  bucketToolStatus,
  buildDateAxis,
  normalizeToolHealthGrid,
  TOOL_HEALTH_COLORS,
} from "@/lib/digest/chart-tool-health";
import type { DailySnapshot, SnapshotTool } from "@/lib/data/snapshot";

function snap(
  date: string,
  tools: SnapshotTool[],
  capturedAt = `${date}T00:00:00Z`,
): DailySnapshot {
  return {
    date,
    capturedAt,
    sources: { total: 0, verified: 0, pending: 0 },
    registry: null,
    events24h: null,
    tools,
    benchmarks: null,
    packages: null,
    labs24h: null,
    failures: [],
  };
}

describe("bucketToolStatus", () => {
  it("maps the canonical status set into 4 visual buckets", () => {
    expect(bucketToolStatus("operational")).toBe("operational");
    expect(bucketToolStatus("degraded")).toBe("degraded");
    expect(bucketToolStatus("partial_outage")).toBe("outage");
    expect(bucketToolStatus("major_outage")).toBe("outage");
    expect(bucketToolStatus("unknown")).toBe("unknown");
  });

  it("falls back to unknown for any out-of-vocab status", () => {
    expect(bucketToolStatus("")).toBe("unknown");
    expect(bucketToolStatus("future-status-string")).toBe("unknown");
  });
});

describe("buildDateAxis", () => {
  it("returns days oldest-first ending on endDate inclusive", () => {
    expect(buildDateAxis("2026-05-04", 7)).toEqual([
      "2026-04-28",
      "2026-04-29",
      "2026-04-30",
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
    ]);
  });

  it("handles single-day window", () => {
    expect(buildDateAxis("2026-05-04", 1)).toEqual(["2026-05-04"]);
  });

  it("rolls over month + year boundaries correctly (UTC)", () => {
    const got = buildDateAxis("2027-01-02", 4);
    expect(got).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("returns empty for unparseable end dates", () => {
    expect(buildDateAxis("not-a-date", 7)).toEqual([]);
  });
});

describe("normalizeToolHealthGrid", () => {
  it("builds a tools × days grid with cells matching the snapshot data", () => {
    const grid = normalizeToolHealthGrid(
      [
        snap("2026-05-04", [
          { id: "claude-code", status: "operational", activeIncidents: 0 },
          { id: "openai", status: "degraded", activeIncidents: 1 },
        ]),
      ],
      "2026-05-04",
      1,
    );
    expect(grid.toolIds).toEqual(["claude-code", "openai"]);
    expect(grid.days).toEqual(["2026-05-04"]);
    expect(grid.cells[0][0]).toEqual({
      bucket: "operational",
      rawStatus: "operational",
      activeIncidents: 0,
    });
    expect(grid.cells[1][0]).toEqual({
      bucket: "degraded",
      rawStatus: "degraded",
      activeIncidents: 1,
    });
  });

  it("renders missing days as null cells (honest gap, not faked green)", () => {
    const grid = normalizeToolHealthGrid(
      [
        snap("2026-05-04", [
          { id: "claude-code", status: "operational", activeIncidents: 0 },
        ]),
      ],
      "2026-05-04",
      3,
    );
    // 3-day axis: 2026-05-02, 2026-05-03, 2026-05-04. Only the last has data.
    expect(grid.days).toEqual(["2026-05-02", "2026-05-03", "2026-05-04"]);
    expect(grid.cells[0][0]).toBeNull();
    expect(grid.cells[0][1]).toBeNull();
    expect(grid.cells[0][2]?.bucket).toBe("operational");
  });

  it("renders rows missing from a present snapshot as null (honest gap per cell)", () => {
    const grid = normalizeToolHealthGrid(
      [
        snap("2026-05-03", [
          { id: "a", status: "operational", activeIncidents: 0 },
          { id: "b", status: "degraded", activeIncidents: 1 },
        ]),
        snap("2026-05-04", [
          { id: "a", status: "operational", activeIncidents: 0 },
          // 'b' missing today — but tool list still includes it from yesterday.
        ]),
      ],
      "2026-05-04",
      2,
    );
    expect(grid.toolIds.sort()).toEqual(["a", "b"]);
    const bIdx = grid.toolIds.indexOf("b");
    expect(grid.cells[bIdx][0]?.bucket).toBe("degraded"); // 05-03
    expect(grid.cells[bIdx][1]).toBeNull(); // 05-04 missing
  });

  it("orders tools by first-seen newest-first, so today's set appears first", () => {
    const grid = normalizeToolHealthGrid(
      [
        snap("2026-05-03", [
          { id: "old-only", status: "operational", activeIncidents: 0 },
        ]),
        snap("2026-05-04", [
          { id: "new-today", status: "operational", activeIncidents: 0 },
          { id: "old-only", status: "operational", activeIncidents: 0 },
        ]),
      ],
      "2026-05-04",
      2,
    );
    expect(grid.toolIds).toEqual(["new-today", "old-only"]);
  });

  it("returns empty grids for an unparseable end date", () => {
    const grid = normalizeToolHealthGrid([], "not-a-date", 7);
    expect(grid.days).toEqual([]);
    expect(grid.toolIds).toEqual([]);
    expect(grid.cells).toEqual([]);
  });

  it("does not mutate the input snapshots array", () => {
    const inputs = [
      snap("2026-05-04", [
        { id: "a", status: "operational", activeIncidents: 0 },
      ]),
    ];
    const before = JSON.stringify(inputs);
    normalizeToolHealthGrid(inputs, "2026-05-04", 1);
    expect(JSON.stringify(inputs)).toBe(before);
  });
});

describe("TOOL_HEALTH_COLORS", () => {
  it("declares a hex colour for every bucket value", () => {
    expect(TOOL_HEALTH_COLORS.operational).toMatch(/^#[0-9a-f]{6}$/i);
    expect(TOOL_HEALTH_COLORS.degraded).toMatch(/^#[0-9a-f]{6}$/i);
    expect(TOOL_HEALTH_COLORS.outage).toMatch(/^#[0-9a-f]{6}$/i);
    expect(TOOL_HEALTH_COLORS.unknown).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
