/**
 * The registry as band occupancy.
 *
 * Pins the three things the phone cannot recover if this body gets them wrong:
 * which cell a coordinate belongs to (the projection is shared with the web, so
 * the two instruments must agree cell for cell), whether a mark is a place or
 * an area centroid, and that a failed read yields nulls rather than an empty
 * band that reads as "no repos anywhere".
 *
 * The coordinates are REAL, sampled from the live registry (2026-09-23) so the
 * precision grader sees exactly what it produced: Germany's centroid is stored
 * at two decimals (51.17, 10.45) and a guessed 51.1657 grades as `null`, which
 * is how the first draft of this test fooled itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry } from "@/lib/data/registry-shared";
import { cellOf, gridWithCols } from "@/lib/world-grid";

const readAllEntriesDetailed = vi.fn();

vi.mock("@/lib/data/repo-registry", async () => {
  const shared = await import("@/lib/data/registry-shared");
  return { ...shared, readAllEntriesDetailed: () => readAllEntriesDetailed() };
});

import {
  bucketIntoCells,
  buildRegistryCellsBody,
  DEFAULT_CELL_COLUMNS,
  parseCellColumns,
} from "@/lib/data/registry-cells";

const CAIRO = { lat: 30.0444, lng: 31.2357, label: "Cairo" };
const GERMANY = { lat: 51.17, lng: 10.45, label: "Germany" };
const EUGENE = { lat: 43.8041, lng: -120.5542, label: "eugene, OR" };
/** Above the band's northern anchor (74°N), so it projects outside the grid. */
const ARCTIC = { lat: 85, lng: 10, label: "nowhere" };

function entry(fullName: string, location?: RegistryEntry["location"]): RegistryEntry {
  const [owner, name] = fullName.split("/");
  return {
    fullName,
    owner,
    name,
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastActivity: "2026-09-01T00:00:00.000Z",
    configs: [{ kind: "claude-md", path: "CLAUDE.md", sample: "x", score: 1, verifiedAt: "2026-01-01T00:00:00.000Z" }],
    location,
  };
}

const grid60 = gridWithCols(60);

beforeEach(() => readAllEntriesDetailed.mockReset());

describe("bucketIntoCells", () => {
  it("counts a place and an area centroid separately in the same row of the body", () => {
    const { cells, placed, offGrid } = bucketIntoCells(
      [entry("a/one", CAIRO), entry("b/two", GERMANY), entry("c/three", GERMANY)],
      grid60,
    );
    expect(placed).toBe(3);
    expect(offGrid).toBe(0);
    const cairo = cellOf(grid60, CAIRO.lng, CAIRO.lat);
    const germany = cellOf(grid60, GERMANY.lng, GERMANY.lat);
    expect(cells).toEqual(
      [[cairo, 1, 0], [germany, 0, 2]].sort((a, b) => a[0] - b[0]),
    );
  });

  it("grades a state centroid as an area, like a national one", () => {
    const { cells } = bucketIntoCells([entry("a/one", EUGENE)], grid60);
    expect(cells).toEqual([[cellOf(grid60, EUGENE.lng, EUGENE.lat), 0, 1]]);
  });

  it("skips an entry with no plottable location — the same rule /api/registry/points uses", () => {
    const { cells, placed, offGrid } = bucketIntoCells(
      [entry("a/one"), entry("b/two", null), entry("c/three", { lat: 51.5 } as never)],
      grid60,
    );
    expect(cells).toEqual([]);
    expect(placed).toBe(0);
    expect(offGrid).toBe(0);
  });

  it("counts a located entry outside the band's latitude span as offGrid, never as a cell", () => {
    const { cells, placed, offGrid } = bucketIntoCells([entry("a/one", ARCTIC), entry("b/two", CAIRO)], grid60);
    expect(offGrid).toBe(1);
    expect(placed).toBe(1);
    expect(cells).toHaveLength(1);
  });

  it("returns cells in ascending index order", () => {
    const { cells } = bucketIntoCells(
      [entry("a/one", EUGENE), entry("b/two", CAIRO), entry("c/three", GERMANY)],
      grid60,
    );
    expect(cells.map((c) => c[0])).toEqual([...cells.map((c) => c[0])].sort((a, b) => a - b));
  });

  it("agrees with the shared projection at both committed resolutions", () => {
    for (const cols of [60, 90] as const) {
      const grid = gridWithCols(cols);
      const { cells } = bucketIntoCells([entry("a/one", CAIRO)], grid);
      expect(cells[0][0]).toBe(cellOf(grid, CAIRO.lng, CAIRO.lat));
    }
  });
});

describe("buildRegistryCellsBody", () => {
  it("echoes the grid it bucketed into, so a client with a drifted mask can refuse to draw", async () => {
    readAllEntriesDetailed.mockResolvedValue({ ok: true, entries: [entry("a/one", CAIRO)] });
    const body = await buildRegistryCellsBody(90);
    const grid90 = gridWithCols(90);
    expect(body.grid).toEqual({ cols: grid90.cols, rows: grid90.rows, cellPx: grid90.cellPx });
  });

  it("carries placed, offGrid and corpus when the read succeeded", async () => {
    readAllEntriesDetailed.mockResolvedValue({
      ok: true,
      entries: [entry("a/one", CAIRO), entry("b/two", GERMANY), entry("c/three"), entry("d/four", ARCTIC)],
    });
    const body = await buildRegistryCellsBody();
    expect(body.degraded).toBe(false);
    expect(body.placed).toBe(2);
    expect(body.offGrid).toBe(1);
    expect(body.corpus).toBe(4);
    expect(body.cells).toHaveLength(2);
  });

  it("is degraded with NULL counts when the registry could not be read — never an empty band reading as zero repos", async () => {
    readAllEntriesDetailed.mockResolvedValue({ ok: false, reason: "absent", message: "evicted" });
    const body = await buildRegistryCellsBody();
    expect(body.degraded).toBe(true);
    expect(body.degradedReason).toBe("absent");
    expect(body.cells).toEqual([]);
    expect(body.placed).toBeNull();
    expect(body.offGrid).toBeNull();
    expect(body.corpus).toBeNull();
  });
});

describe("parseCellColumns", () => {
  it("accepts the committed grids and falls back to the band's own for anything else", () => {
    expect(parseCellColumns("60")).toBe(60);
    expect(parseCellColumns("90")).toBe(90);
    expect(parseCellColumns("120")).toBe(DEFAULT_CELL_COLUMNS);
    expect(parseCellColumns("banana")).toBe(DEFAULT_CELL_COLUMNS);
    expect(parseCellColumns(null)).toBe(DEFAULT_CELL_COLUMNS);
  });
});
