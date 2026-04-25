"use client";

/**
 * SdkAdoptionPanel — top-level panel for the SDK Adoption matrix.
 *
 * Presentational + minimal state: receives the DTO from a parent (the
 * Dashboard's polled hook or the standalone /panels/sdk-adoption page)
 * and manages the drawer-open state internally. State is just one
 * thing: which row id is focused (drawer mounts iff a focused row is
 * set AND that row exists in the DTO).
 *
 * `initialFocusedRowId` lets the standalone page pass `?focus=` in
 * from the URL on first mount; the panel then takes over for subsequent
 * row clicks.
 *
 * Empty / loading / error fallbacks are first-class — the panel is
 * shown before there's a baseline (per PRD §6 ship-deep-not-wide).
 */

import * as React from "react";
import { useEffect, useState } from "react";
import type { SdkAdoptionDto } from "@/lib/data/sdk-adoption";
import { MatrixHeatmap } from "@/components/panels/sdk-adoption/MatrixHeatmap";
import { RowDrawer } from "@/components/panels/sdk-adoption/RowDrawer";

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
};

export function SdkAdoptionPanel({
  data,
  error,
  isInitialLoading,
  originUrl,
  initialFocusedRowId,
  viewportWidth,
  onRetry,
}: SdkAdoptionPanelProps): React.ReactElement {
  const [focusedRowId, setFocusedRowId] = useState<string | null>(
    initialFocusedRowId ?? null,
  );
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

  const columnDates = deriveColumnDates(data);
  const focusedPackage =
    focusedRowId !== null
      ? data.packages.find((p) => p.id === focusedRowId) ?? null
      : null;

  return (
    <div className="sdk-adoption-panel">
      <MatrixHeatmap
        rows={data.packages}
        columnDates={columnDates}
        viewportWidth={vw}
        focusedRowId={focusedRowId}
        onCellClick={(pkgId) => setFocusedRowId(pkgId)}
      />
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
