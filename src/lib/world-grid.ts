/**
 * The world in the system's own marks (web v2, PRD §1 ruling 2): a dot-matrix band where a cell is
 * solid only when a real, located public event landed there in the rolling window, and hollow for
 * land with nothing recorded. Incidents stay on the tool rows, where their source is.
 *
 * The land mask in `src/data/world-grid.json` was sampled from a rendered OpenFreeMap positron frame
 * (OpenMapTiles, © OpenStreetMap contributors, ODbL) at a fixed centre / zoom; this module reproduces
 * MapLibre's `map.project()` for that render so live events bucket into the same cells the mask was
 * sampled on. Everything here is pure and deterministic — no interpolation, no smoothing: a cell is
 * solid iff at least one event's coordinates fall inside it.
 */
import worldGrid from "@/data/world-grid.json";

export type WorldGridCell = "solid" | "hollow" | "none";

export type WorldGrid = {
  cols: number;
  rows: number;
  /** cell edge in render pixels */
  cellPx: number;
  /** render-space y of latNorth / latSouth */
  yN: number;
  yS: number;
  /** one string per row, "1" = land */
  land: string[];
};

export type WorldGridFile = {
  note: string;
  renderWidthPx: number;
  renderHeightPx: number;
  center: [number, number];
  zoom: number;
  latNorth: number;
  latSouth: number;
  grids: WorldGrid[];
};

export const WORLD_GRID: WorldGridFile = worldGrid as WorldGridFile;

const TILE_SIZE = 512;

/** MapLibre world width in pixels for the render zoom. */
function worldSizePx(): number {
  return TILE_SIZE * Math.pow(2, WORLD_GRID.zoom);
}

function mercatorY(latDeg: number): number {
  const lat = (latDeg * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}

/**
 * Screen position of a coordinate on the sampled render (MapLibre `map.project`), in render pixels.
 * Exact for the stored centre / zoom / viewport — the stored yN / yS anchors are reproduced to 1e-12.
 */
export function projectToRender(lng: number, lat: number): { x: number; y: number } {
  const W = worldSizePx();
  const [cLng, cLat] = WORLD_GRID.center;
  const x = WORLD_GRID.renderWidthPx / 2 + ((lng - cLng) / 360) * W;
  const y = WORLD_GRID.renderHeightPx / 2 + ((mercatorY(cLat) - mercatorY(lat)) / (2 * Math.PI)) * W;
  return { x, y };
}

/** Grid by column count (90 = desktop band, 60 = phone band). */
export function gridWithCols(cols: number): WorldGrid {
  const g = WORLD_GRID.grids.find((grid) => grid.cols === cols);
  if (!g) throw new Error(`world-grid: no grid with ${cols} columns`);
  return g;
}

/** Cell index (row-major) for a coordinate, or -1 when it falls outside the band's latitude span. */
export function cellOf(grid: WorldGrid, lng: number, lat: number): number {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return -1;
  const p = projectToRender(lng, lat);
  const cx = Math.floor(p.x / grid.cellPx);
  const ry = Math.floor((p.y - grid.yN) / grid.cellPx);
  if (cx < 0 || cx >= grid.cols || ry < 0 || ry >= grid.rows) return -1;
  return ry * grid.cols + cx;
}

export function isLand(grid: WorldGrid, cell: number): boolean {
  if (cell < 0) return false;
  const row = grid.land[Math.floor(cell / grid.cols)];
  return row?.[cell % grid.cols] === "1";
}

export type BucketedEvents = {
  /** cell index → number of located events that landed there */
  counts: Map<number, number>;
  /** events that fell inside the band (the rest are outside 74°N … 56°S) */
  placed: number;
  /** events received with coordinates */
  total: number;
};

/** Bucket located events into the grid. Pure: same input, same cells. */
export function bucketEvents(
  grid: WorldGrid,
  points: ReadonlyArray<{ lng: number; lat: number }>,
): BucketedEvents {
  const counts = new Map<number, number>();
  let placed = 0;
  for (const p of points) {
    const c = cellOf(grid, p.lng, p.lat);
    if (c < 0) continue;
    placed += 1;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return { counts, placed, total: points.length };
}

/** What a cell draws as: solid (an event landed), hollow (land, nothing recorded), none (sea). */
export function cellMark(grid: WorldGrid, counts: ReadonlyMap<number, number>, cell: number): WorldGridCell {
  if ((counts.get(cell) ?? 0) > 0) return "solid";
  return isLand(grid, cell) ? "hollow" : "none";
}

/** Points grouped by the cell they fall in (same projection as bucketEvents). */
export function groupByCell<P extends { lng: number; lat: number }>(
  grid: WorldGrid,
  points: ReadonlyArray<P>,
): Map<number, P[]> {
  const out = new Map<number, P[]>();
  for (const p of points) {
    const c = cellOf(grid, p.lng, p.lat);
    if (c < 0) continue;
    const list = out.get(c);
    if (list) list.push(p);
    else out.set(c, [p]);
  }
  return out;
}

/** The (2r+1)² cells around `cell`, clipped to the grid; row-major, the centre included. */
export function neighbourhood(grid: WorldGrid, cell: number, radius: number): number[] {
  if (cell < 0) return [];
  const cx = cell % grid.cols;
  const ry = Math.floor(cell / grid.cols);
  const out: number[] = [];
  for (let y = ry - radius; y <= ry + radius; y++) {
    if (y < 0 || y >= grid.rows) continue;
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || x >= grid.cols) continue;
      out.push(y * grid.cols + x);
    }
  }
  return out;
}

export type RegionPoint = { lng: number; lat: number; meta?: Record<string, unknown> };

export type RegionSummary = {
  count: number;
  aiConfig: number;
  /** country → count, most first */
  countries: Array<[string, number]>;
  /** event type → count, most first */
  types: Array<[string, number]>;
  /** repo → count, most first */
  repos: Array<[string, number]>;
};

function tally(m: Map<string, number>, key: unknown): void {
  if (typeof key !== "string" || key.length === 0) return;
  m.set(key, (m.get(key) ?? 0) + 1);
}
function ranked(m: Map<string, number>): Array<[string, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** What the lens says about a set of points: counts only, every one from the points themselves. */
export function regionSummary(points: ReadonlyArray<RegionPoint>): RegionSummary {
  const countries = new Map<string, number>();
  const types = new Map<string, number>();
  const repos = new Map<string, number>();
  let aiConfig = 0;
  for (const p of points) {
    const m = p.meta ?? {};
    if (m.hasAiConfig === true) aiConfig += 1;
    tally(countries, m.country);
    tally(types, m.type);
    tally(repos, m.repo);
  }
  return { count: points.length, aiConfig, countries: ranked(countries), types: ranked(types), repos: ranked(repos) };
}
