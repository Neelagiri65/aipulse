/**
 * The registry as world-band cells — `/api/registry/cells`.
 *
 * The iOS app draws a dot-matrix band, not a basemap: land is a grid of hollow
 * cells and a cell goes solid when something real fell inside it. It needs
 * OCCUPANCY, not coordinates, so this endpoint buckets the located registry
 * into the same grid the phone bundles and the web homepage draws.
 *
 * Why not reuse `/api/registry/points`: 25,083 located repos is 7.0 MB, and
 * those coordinates collapse into **164 cells at 60 columns** — the grid the
 * phone's band uses — or 218 at 90, because the geocoder quantises to city and
 * national centroids. Measured against the real corpus on 2026-09-23: this
 * body is **2,134 bytes**. Sending 7 MB to a phone to paint 164 marks would be
 * absurd.
 *
 * `place` and `area` are counted separately because the band draws them
 * differently and must: a national centroid is 967 repos that wrote "Germany",
 * not 967 repos in a field near Kassel. The app already renders an area as a
 * dashed ring with a count and a place as a dot, and it cannot make that
 * distinction from an occupancy count alone. More than half the registry
 * (13,576 of 25,083) is area-precision, so collapsing the two would overstate
 * what the map knows about half its own marks.
 *
 * The grid constants are echoed so a client whose bundled `world-grid.json`
 * has drifted can refuse to draw rather than paint cells at the wrong size.
 */
import { cellOf, gridWithCols, type WorldGrid } from "@/lib/world-grid";
import { precisionForCoords } from "@/lib/geocoding";
import { readAllEntriesDetailed } from "@/lib/data/repo-registry";
import { toRegistryPoint } from "@/lib/data/registry-points";

/** The grids committed in `src/data/world-grid.json`. The app's band uses 60. */
export const CELL_GRID_COLUMNS = [60, 90] as const;
export type CellGridColumns = (typeof CELL_GRID_COLUMNS)[number];
export const DEFAULT_CELL_COLUMNS: CellGridColumns = 60;

/** `[cell index, repos at a place, repos at an area centroid]`. */
export type RegistryCell = [number, number, number];

export type RegistryCellsBody = {
  ok: true;
  grid: { cols: number; rows: number; cellPx: number };
  cells: RegistryCell[];
  /** Located entries that fell inside the band. Null when the read failed. */
  placed: number | null;
  /**
   * Located entries whose coordinates fall outside the band's latitude span
   * (74°N–56°S). Reported rather than silently dropped: a reader comparing this
   * with `/api/registry/points` would otherwise find marks missing with no
   * reason given.
   */
  offGrid: number | null;
  /** Entries in the whole registry, located or not. Null when the read failed. */
  corpus: number | null;
  degraded: boolean;
  degradedReason: string | null;
  generatedAt: string;
};

export function isCellGridColumns(v: unknown): v is CellGridColumns {
  return typeof v === "number" && (CELL_GRID_COLUMNS as readonly number[]).includes(v);
}

/** `?cols=` → a committed grid. Anything unparseable or unknown falls back to the default. */
export function parseCellColumns(raw: string | null): CellGridColumns {
  const n = Number(raw);
  return isCellGridColumns(n) ? n : DEFAULT_CELL_COLUMNS;
}

type Bucketed = { cells: RegistryCell[]; placed: number; offGrid: number };

/** Pure: entries → occupancy, so a test can drive it without Redis or a fetch. */
export function bucketIntoCells(
  entries: readonly Parameters<typeof toRegistryPoint>[0][],
  grid: WorldGrid,
): Bucketed {
  const byCell = new Map<number, [number, number]>();
  let placed = 0;
  let offGrid = 0;
  for (const entry of entries) {
    const point = toRegistryPoint(entry);
    if (!point) continue;              // not located — same rule as /points
    const index = cellOf(grid, point.lng, point.lat);
    if (index < 0) {
      offGrid++;
      continue;
    }
    placed++;
    const precision = precisionForCoords(point.lat, point.lng);
    const isArea = precision === "region" || precision === "country";
    const cur = byCell.get(index) ?? [0, 0];
    if (isArea) cur[1] += 1;
    else cur[0] += 1;
    byCell.set(index, cur);
  }
  // Ascending index: a stable order makes the body diffable and lets the client
  // walk it without sorting.
  const cells = [...byCell.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, [place, area]]) => [index, place, area] as RegistryCell);
  return { cells, placed, offGrid };
}

export async function buildRegistryCellsBody(cols: CellGridColumns = DEFAULT_CELL_COLUMNS): Promise<RegistryCellsBody> {
  const generatedAt = new Date().toISOString();
  const grid = gridWithCols(cols);
  const shape = { cols: grid.cols, rows: grid.rows, cellPx: grid.cellPx };
  const read = await readAllEntriesDetailed();
  if (!read.ok) {
    return {
      ok: true,
      grid: shape,
      cells: [],
      placed: null,
      offGrid: null,
      corpus: null,
      degraded: true,
      degradedReason: read.reason,
      generatedAt,
    };
  }
  const { cells, placed, offGrid } = bucketIntoCells(read.entries, grid);
  return {
    ok: true,
    grid: shape,
    cells,
    placed,
    offGrid,
    corpus: read.entries.length,
    degraded: false,
    degradedReason: null,
    generatedAt,
  };
}
