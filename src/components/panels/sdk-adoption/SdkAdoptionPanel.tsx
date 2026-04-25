"use client";

/**
 * SdkAdoptionPanel — top-level panel for the SDK Adoption surface.
 *
 * Default view is the SparklineListView. Matrix heatmap is the
 * secondary view, accessible via the "View heatmap" toggle. The
 * matrix-first default was unreadable during the 30-day baseline-fill
 * window because most cells were null; the list handles sparse data
 * gracefully and is dense enough to scan at a glance.
 *
 * Internal state is two things:
 *   - viewMode: "list" | "heatmap"
 *   - focusedRowId: which row's drawer is open (mounts iff that row
 *     exists in the DTO).
 *
 * `initialFocusedRowId` (from `?focus=` on the standalone page) seeds
 * the drawer on first mount.
 */

import * as React from "react";
import { useEffect, useState } from "react";
import type { SdkAdoptionDto } from "@/lib/data/sdk-adoption";
import { stripLeadingNullDates } from "@/lib/data/sdk-adoption-view";
import { MatrixHeatmap } from "@/components/panels/sdk-adoption/MatrixHeatmap";
import { RowDrawer } from "@/components/panels/sdk-adoption/RowDrawer";
import { SparklineListView } from "@/components/panels/sdk-adoption/SparklineListView";

export type SdkAdoptionPanelProps = {
  data: SdkAdoptionDto | null;
  /** Matches the usePolledEndpoint contract — string when the last
   *  poll failed, null when no error. Tests pass `Error` directly;
   *  both are coerced via String(). */
  error: string | Error | null;
  isInitialLoading: boolean;
  originUrl: string;
  /** From `?focus=` on the standalone page; ignored if the row id
   *  doesn't appear in `data.packages`. */
  initialFocusedRowId?: string | null;
  /** Override viewport width for tests. Defaults to window.innerWidth
   *  (1440 fallback when window is unavailable, matching SSR). */
  viewportWidth?: number;
  /** Optional retry hook for the error fallback. When omitted, the
   *  retry button reloads the page (the polled endpoint refetches on
   *  the next visibility/interval tick). */
  onRetry?: () => void;
  /** Override the initial view. Tests use this; consumers should rely
   *  on the toggle. */
  initialViewMode?: "list" | "heatmap";
};

export function SdkAdoptionPanel({
  data,
  error,
  isInitialLoading,
  originUrl,
  initialFocusedRowId,
  viewportWidth,
  onRetry,
  initialViewMode = "list",
}: SdkAdoptionPanelProps): React.ReactElement {
  const [focusedRowId, setFocusedRowId] = useState<string | null>(
    initialFocusedRowId ?? null,
  );
  const [viewMode, setViewMode] = useState<"list" | "heatmap">(initialViewMode);
  const [vw, setVw] = useState<number>(
    viewportWidth ??
      (typeof window !== "undefined" ? window.innerWidth : 1440),
  );

  useEffect(() => {
    if (viewportWidth !== undefined) return;
    if (typeof window === "undefined") return;
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [viewportWidth]);

  if (!data && isInitialLoading) {
    return (
      <div className="sdk-adoption-panel sdk-adoption-loading" role="status">
        Loading the latest snapshot — first cells light up shortly.
      </div>
    );
  }

  if (!data && error) {
    const handleRetry = () => {
      if (onRetry) onRetry();
      else if (typeof window !== "undefined") window.location.reload();
    };
    return (
      <div className="sdk-adoption-panel sdk-adoption-error" role="alert">
        <p>Couldn&apos;t load SDK adoption data — try again in a minute.</p>
        <button
          type="button"
          onClick={handleRetry}
          className="sdk-adoption-retry"
          aria-label="Retry loading SDK adoption data"
        >
          Retry now
        </button>
      </div>
    );
  }

  if (!data || data.packages.length === 0) {
    return (
      <div className="sdk-adoption-panel sdk-adoption-empty" role="status">
        Collecting baseline. The matrix fills out over the next 30 days
        as daily snapshots accumulate; cells start lighting up after the
        first two snapshots land.
      </div>
    );
  }

  // Strip leading null-only columns before rendering either view —
  // makes the matrix less broken AND keeps the list compact.
  const trimmed = stripLeadingNullDates(data);
  const columnDates = deriveColumnDates(trimmed);
  const focusedPackage =
    focusedRowId !== null
      ? trimmed.packages.find((p) => p.id === focusedRowId) ?? null
      : null;

  return (
    <div className="sdk-adoption-panel">
      <div className="sdk-adoption-toolbar" role="toolbar" aria-label="View mode">
        <button
          type="button"
          className={`sdk-view-toggle ${viewMode === "list" ? "is-active" : ""}`}
          onClick={() => setViewMode("list")}
          aria-pressed={viewMode === "list"}
        >
          List
        </button>
        <button
          type="button"
          className={`sdk-view-toggle ${viewMode === "heatmap" ? "is-active" : ""}`}
          onClick={() => setViewMode("heatmap")}
          aria-pressed={viewMode === "heatmap"}
        >
          Heatmap
        </button>
      </div>
      {viewMode === "list" ? (
        <SparklineListView
          data={trimmed}
          originUrl={originUrl}
          focusedRowId={focusedRowId}
          onRowClick={(pkgId) => setFocusedRowId(pkgId)}
        />
      ) : (
        <MatrixHeatmap
          rows={trimmed.packages}
          columnDates={columnDates}
          viewportWidth={vw}
          focusedRowId={focusedRowId}
          onCellClick={(pkgId) => setFocusedRowId(pkgId)}
        />
      )}
      {focusedPackage ? (
        <RowDrawer
          pkg={focusedPackage}
          open={true}
          onClose={() => setFocusedRowId(null)}
          originUrl={originUrl}
        />
      ) : null}
    </div>
  );
}

function deriveColumnDates(data: SdkAdoptionDto): string[] {
  // All rows share the same column-date axis (assembler emits the same
  // windowDays array per row); take the longest row's days as the
  // canonical axis to defend against any inconsistency.
  let longest: string[] = [];
  for (const p of data.packages) {
    if (p.days.length > longest.length) {
      longest = p.days.map((d) => d.date);
    }
  }
  return longest;
}

export default SdkAdoptionPanel;
