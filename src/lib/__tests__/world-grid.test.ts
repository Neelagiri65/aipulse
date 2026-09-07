import { describe, expect, it } from "vitest";
import labs from "../../../data/ai-labs.json";
import check from "./fixtures/world-grid-check.json";
import {
  WORLD_GRID,
  bucketEvents,
  cellMark,
  cellOf,
  gridWithCols,
  groupByCell,
  isLand,
  neighbourhood,
  projectToRender,
  regionSummary,
} from "../world-grid";

/**
 * The fixture was produced by the sampling script (vault design/web/worldgrid.mjs) with MapLibre's own
 * map.project() on the 2026-09-05 render: labCells90 = every registry HQ bucketed on the 90-column
 * grid; samplePoints = 60 of the 1,374 located events of that poll; events90 = the full bucket
 * counts of that poll. The TypeScript projection has to land every one of them in the same cell.
 */
describe("world-grid", () => {
  it("every grid is rectangular and its land rows match its dimensions", () => {
    expect(WORLD_GRID.grids.length).toBeGreaterThanOrEqual(2);
    for (const g of WORLD_GRID.grids) {
      expect(g.land).toHaveLength(g.rows);
      for (const row of g.land) {
        expect(row).toHaveLength(g.cols);
        expect(row).toMatch(/^[01]+$/);
      }
      expect(Math.round((g.yS - g.yN) / g.cellPx)).toBe(g.rows);
      expect(g.cellPx * g.cols).toBeCloseTo(WORLD_GRID.renderWidthPx, 6);
    }
  });

  it("reproduces the render's latitude anchors from centre + zoom", () => {
    const g = gridWithCols(90);
    expect(projectToRender(0, WORLD_GRID.latNorth).y).toBeCloseTo(g.yN, 9);
    expect(projectToRender(0, WORLD_GRID.latSouth).y).toBeCloseTo(g.yS, 9);
  });

  it("buckets every registry HQ into the cell MapLibre put it in (labCells90)", () => {
    const g = gridWithCols(90);
    const got = new Map<number, string[]>();
    for (const lab of labs as Array<{ id: string; lng: number; lat: number }>) {
      const c = cellOf(g, lab.lng, lab.lat);
      if (c < 0) continue;
      got.set(c, [...(got.get(c) ?? []), lab.id].sort());
    }
    const want = new Map(
      Object.entries(check.labCells90).map(([c, ids]) => [Number(c), [...ids].sort()]),
    );
    expect(Object.fromEntries(got)).toEqual(Object.fromEntries(want));
  });

  it("lands every sampled event of the 2026-09-05 poll in a cell that recorded events", () => {
    const g = gridWithCols(90);
    const events90 = check.events90 as Record<string, number>;
    for (const p of check.samplePoints) {
      const c = cellOf(g, p.lng, p.lat);
      expect(c, `${p.lat},${p.lng}`).toBeGreaterThanOrEqual(0);
      expect(events90[String(c)], `cell ${c} for ${p.lat},${p.lng}`).toBeGreaterThan(0);
    }
  });

  it("drops coordinates outside 74°N … 56°S and non-finite input", () => {
    const g = gridWithCols(90);
    expect(cellOf(g, 0, 80)).toBe(-1);
    expect(cellOf(g, 0, -70)).toBe(-1);
    expect(cellOf(g, Number.NaN, 10)).toBe(-1);
    expect(bucketEvents(g, [{ lng: 0, lat: 80 }, { lng: 10.45, lat: 51.17 }])).toMatchObject({
      placed: 1,
      total: 2,
    });
  });

  it("marks: solid only where an event landed, hollow on land, none at sea", () => {
    const g = gridWithCols(90);
    const berlin = cellOf(g, 13.405, 52.52);
    const midAtlantic = cellOf(g, -30, 30);
    expect(isLand(g, berlin)).toBe(true);
    expect(isLand(g, midAtlantic)).toBe(false);
    const { counts } = bucketEvents(g, [{ lng: 13.405, lat: 52.52 }]);
    expect(cellMark(g, counts, berlin)).toBe("solid");
    expect(cellMark(g, new Map(), berlin)).toBe("hollow");
    expect(cellMark(g, counts, midAtlantic)).toBe("none");
  });

  it("the 60-column phone grid exists and places the same HQs inside the band as the 90-column grid", () => {
    const g90 = gridWithCols(90);
    const g60 = gridWithCols(60);
    const pts = (labs as Array<{ lng: number; lat: number }>).map(({ lng, lat }) => ({ lng, lat }));
    expect(bucketEvents(g60, pts).placed).toBe(bucketEvents(g90, pts).placed);
  });

  it("groupByCell keeps every placed point under its cell, in input order", () => {
    const g = gridWithCols(90);
    const pts = [
      { lng: -0.1278, lat: 51.5074, meta: { repo: "a/a" } },
      { lng: 0, lat: 80, meta: { repo: "out" } },
      { lng: -0.1325, lat: 51.5175, meta: { repo: "b/b" } },
    ];
    const by = groupByCell(g, pts);
    const london = cellOf(g, -0.1278, 51.5074);
    expect(by.get(london)?.map((p) => p.meta.repo)).toEqual(["a/a", "b/b"]);
    expect([...by.values()].flat()).toHaveLength(2);
  });

  it("neighbourhood is (2r+1)² inside the grid and clips at the edges", () => {
    const g = gridWithCols(90);
    const mid = 20 * g.cols + 40;
    expect(neighbourhood(g, mid, 2)).toHaveLength(25);
    expect(neighbourhood(g, mid, 2)).toContain(mid);
    expect(neighbourhood(g, 0, 2)).toHaveLength(9); // top-left corner
    expect(neighbourhood(g, g.cols - 1, 1)).toHaveLength(4); // top-right corner
    expect(neighbourhood(g, -1, 2)).toEqual([]);
  });

  it("regionSummary counts only what the points carry, ranked most-first", () => {
    const s = regionSummary([
      { lng: 0, lat: 0, meta: { hasAiConfig: true, country: "Germany", type: "PushEvent", repo: "x/y" } },
      { lng: 0, lat: 0, meta: { hasAiConfig: false, country: "Germany", type: "IssuesEvent", repo: "x/y" } },
      { lng: 0, lat: 0, meta: { hasAiConfig: true, country: "France", type: "PushEvent", repo: "p/q" } },
      { lng: 0, lat: 0, meta: {} },
    ]);
    expect(s.count).toBe(4);
    expect(s.aiConfig).toBe(2);
    expect(s.countries).toEqual([["Germany", 2], ["France", 1]]);
    expect(s.types).toEqual([["PushEvent", 2], ["IssuesEvent", 1]]);
    expect(s.repos).toEqual([["x/y", 2], ["p/q", 1]]);
  });
});
