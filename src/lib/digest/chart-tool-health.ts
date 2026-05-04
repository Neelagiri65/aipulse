/**
 * Pure normalizer for the digest tool-health 7-day grid PNG.
 *
 * Inputs: an array of `DailySnapshot` (newest-first or any order) and
 * an end-date (YYYY-MM-DD). Output: a `{ tools, days, cells }` grid
 * where `cells[ti][di]` is the bucketed status for tool `ti` on day
 * `di`, or `null` when the snapshot for that day is missing or didn't
 * carry a row for that tool.
 *
 * Why a separate normalizer (vs inline in the route): the route does
 * IO (Redis reads + ImageResponse rendering) and is hard to test;
 * keeping the shape transform pure means the harder-to-eyeball logic
 * (date axis, status bucketing, missing-day handling) is unit-tested.
 *
 * Trust contract:
 *   - Missing days render as `null` (grey "no data" cells), never as
 *     a fabricated "operational" green. An honest gap > a comforting
 *     lie.
 *   - Status bucketing collapses the upstream label set into 4
 *     visually-distinct buckets; the original status string is kept
 *     in the grid for tooltip use.
 *   - The date axis is built from the requested end-date backwards by
 *     calendar day, NOT from whichever days the snapshot store
 *     happens to have. A missing day in the middle is visible (grey
 *     column), not silently dropped.
 */

import type { DailySnapshot, SnapshotTool } from "@/lib/data/snapshot";

export type ToolHealthBucket =
  | "operational"
  | "degraded"
  | "outage"
  | "unknown";

export type ToolHealthCell = {
  bucket: ToolHealthBucket;
  /** Original status string from the snapshot (e.g. "partial_outage") so
   *  the renderer can show it on hover. Null when the day is missing. */
  rawStatus: string | null;
  /** Active incidents reported by the tool that day. 0 when none, null
   *  when the day or row is missing. */
  activeIncidents: number | null;
};

export type ToolHealthGrid = {
  /** Stable list of tool ids, in the same order they appear in the most
   *  recent snapshot that carried each id. New tools added mid-window
   *  appear at the end. */
  toolIds: string[];
  /** Calendar-day axis from `endDate - (days-1)` through `endDate`,
   *  oldest first. Always exactly `days` long. */
  days: string[];
  /** `cells[toolIndex][dayIndex]`. Same dimensions as `toolIds × days`. */
  cells: (ToolHealthCell | null)[][];
};

export function bucketToolStatus(status: string): ToolHealthBucket {
  switch (status) {
    case "operational":
      return "operational";
    case "degraded":
      return "degraded";
    case "partial_outage":
    case "major_outage":
      return "outage";
    default:
      return "unknown";
  }
}

export function buildDateAxis(endDate: string, days: number): string[] {
  // Parse the end date as UTC midnight. Walk backwards `days-1` calendar
  // days. Output is oldest-first to match read order.
  const t = Date.UTC(
    Number(endDate.slice(0, 4)),
    Number(endDate.slice(5, 7)) - 1,
    Number(endDate.slice(8, 10)),
  );
  if (!Number.isFinite(t)) return [];
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(t - i * 24 * 60 * 60 * 1000);
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
}

export function normalizeToolHealthGrid(
  snapshots: readonly DailySnapshot[],
  endDate: string,
  days: number = 7,
): ToolHealthGrid {
  const dayAxis = buildDateAxis(endDate, days);
  const byDate = new Map<string, DailySnapshot>();
  for (const s of snapshots) byDate.set(s.date, s);

  // Stable tool ordering: walk snapshots newest-first (by the date axis,
  // most recent end), collecting tool ids in first-seen order.
  const toolIds: string[] = [];
  const seen = new Set<string>();
  for (let i = dayAxis.length - 1; i >= 0; i -= 1) {
    const snap = byDate.get(dayAxis[i]);
    if (!snap) continue;
    for (const t of snap.tools) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      toolIds.push(t.id);
    }
  }

  const cells: (ToolHealthCell | null)[][] = toolIds.map(() =>
    dayAxis.map(() => null),
  );

  toolIds.forEach((id, ti) => {
    dayAxis.forEach((date, di) => {
      const snap = byDate.get(date);
      if (!snap) return;
      const row: SnapshotTool | undefined = snap.tools.find((t) => t.id === id);
      if (!row) return;
      cells[ti][di] = {
        bucket: bucketToolStatus(row.status),
        rawStatus: row.status,
        activeIncidents: row.activeIncidents,
      };
    });
  });

  return { toolIds, days: dayAxis, cells };
}

/** Hex colours used by the PNG renderer per bucket. Centralised so the
 *  route + any future legend renderer agree pixel-for-pixel. */
export const TOOL_HEALTH_COLORS: Record<ToolHealthBucket, string> = {
  operational: "#10b981",
  degraded: "#f59e0b",
  outage: "#ef4444",
  unknown: "#475569",
};
