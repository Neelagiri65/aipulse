/**
 * MatrixHeatmap — the rows × columns grid for the SDK Adoption panel.
 *
 * Visual:
 *   - Sticky-left first column = row label (`registry:name`).
 *   - One column per `columnDates` entry, newest right.
 *   - Cell colour scaled by signed delta magnitude (cell-pos-low /
 *     cell-pos-mid / cell-pos-high vs the negative mirror; cell-zero;
 *     cell-null).
 *
 * Responsive:
 *   - viewportWidth ≥ 1280 → all 30 columns.
 *   - 768–1279       → trailing 14 columns.
 *   - <768           → rows-only (no data cells; shows current delta as a chip).
 *
 * Stale: if `nowMs - row.latest.fetchedAt > 25h` (or fetchedAt missing),
 * the row carries `row-stale` and renders at half opacity via CSS.
 *
 * Interaction: each data cell carries `data-date` + `data-pkg-id` so a
 * single click delegate on the table can route to the drawer with row
 * id + date context. Pure render — no internal state.
 */

import * as React from "react";
import type { SdkAdoptionPackage } from "@/lib/data/sdk-adoption";

const STALE_MS = 25 * 60 * 60 * 1000;

export type MatrixHeatmapProps = {
  rows: SdkAdoptionPackage[];
  columnDates: string[];
  viewportWidth: number;
  focusedRowId?: string | null;
  /** Override "now" for stale tests. Defaults to Date.now(). */
  nowMs?: number;
  /** Click handler — routes to the drawer. Receives the row id and the
   *  date the user clicked (last column in rows-only mode). */
  onCellClick?: (pkgId: string, date: string | null) => void;
};

export function cellClassFromDelta(delta: number | null): string {
  if (delta === null) return "cell-null";
  if (delta === 0) return "cell-zero";
  const sign = delta > 0 ? "pos" : "neg";
  const mag = Math.abs(delta);
  if (mag < 0.05) return `cell-${sign}-low`;
  if (mag < 0.25) return `cell-${sign}-mid`;
  return `cell-${sign}-high`;
}

export function visibleColumnDates(
  allDates: string[],
  viewportWidth: number,
): string[] {
  if (viewportWidth >= 1280) return allDates;
  if (viewportWidth >= 768) {
    return allDates.slice(Math.max(0, allDates.length - 14));
  }
  return [];
}

export function MatrixHeatmap({
  rows,
  columnDates,
  viewportWidth,
  focusedRowId,
  nowMs,
  onCellClick,
}: MatrixHeatmapProps): React.ReactElement {
  if (rows.length === 0) {
    return (
      <div role="status" className="matrix-empty">
        No rows yet — package counters are still loading.
      </div>
    );
  }

  const visible = visibleColumnDates(columnDates, viewportWidth);
  const rowsOnly = visible.length === 0;
  const now = nowMs ?? Date.now();

  return (
    <table role="grid" className="sdk-matrix" data-rows-only={rowsOnly || undefined}>
      <thead>
        <tr role="row">
          <th scope="col" className="row-label-head">
            Package
          </th>
          {rowsOnly ? (
            <th scope="col" className="latest-delta-head">
              Latest Δ
            </th>
          ) : (
            visible.map((d) => (
              <th key={d} scope="col" data-date={d}>
                {d.slice(5)}
              </th>
            ))
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const stale = isStale(r.latest.fetchedAt, now);
          const focused = focusedRowId === r.id;
          const lastDay = r.days[r.days.length - 1];
          const classes = [
            "row",
            focused ? "row-focused" : "",
            stale ? "row-stale" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <tr key={r.id} role="row" className={classes} data-pkg-id={r.id}>
              <th scope="row" className="row-label">
                <span className="row-registry">{r.registry}</span>
                <span className="row-name">{r.label}</span>
                {stale ? <span className="row-stale-pill">stale</span> : null}
              </th>
              {rowsOnly ? (
                <td role="gridcell" className={cellClassFromDelta(lastDay?.delta ?? null)}>
                  {formatDelta(lastDay?.delta ?? null)}
                </td>
              ) : (
                visible.map((d) => {
                  const day = r.days.find((x) => x.date === d);
                  return (
                    <td
                      key={d}
                      role="gridcell"
                      data-date={d}
                      data-pkg-id={r.id}
                      className={cellClassFromDelta(day?.delta ?? null)}
                      onClick={
                        onCellClick
                          ? () => onCellClick(r.id, d)
                          : undefined
                      }
                      title={formatTooltip(day)}
                    >
                      <span className="cell-sr">
                        {formatTooltip(day)}
                      </span>
                    </td>
                  );
                })
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function isStale(fetchedAt: string | null, nowMs: number): boolean {
  if (!fetchedAt) return true;
  const t = Date.parse(fetchedAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t > STALE_MS;
}

function formatDelta(delta: number | null): string {
  if (delta === null) return "—";
  const pct = Math.round(delta * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function formatTooltip(
  day: { date: string; count: number | null; delta: number | null } | undefined,
): string {
  if (!day) return "no data";
  if (day.count === null) return `${day.date}: no data`;
  return `${day.date}: ${day.count.toLocaleString()} (${formatDelta(day.delta)})`;
}

export default MatrixHeatmap;
