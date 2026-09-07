"use client";

import { memo, useMemo } from "react";
import type { GlobeEventsResult } from "@/lib/data/fetch-events";
import { bucketEvents, cellMark, gridWithCols } from "@/lib/world-grid";

type WorldBandProps = {
  events: GlobeEventsResult | undefined;
  /** true until the first /api/globe-events poll answers */
  loading: boolean;
  /** latest poll error; `events` may still hold the last good poll */
  error?: string;
  /** 90 = desktop column, 60 = phone */
  cols?: 90 | 60;
  onOpenMap: () => void;
};

/** viewBox units per cell; the SVG scales to the column width */
const PITCH = 8;
const R_SOLID = (PITCH * 0.36).toFixed(2);
const R_HOLLOW = (PITCH * 0.26).toFixed(2);
const LAND_MASK_SAMPLED = "2026-09-05";

function hhmmUtc(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/**
 * The world in the system's own marks: solid = a located public event landed in this cell during
 * the rolling window, hollow = land with nothing recorded, blank = sea. No incident marks here —
 * incidents stay on the tool rows with their status-page source. Tapping the band opens the Map tab.
 */
export const WorldBand = memo(function WorldBand({
  events,
  loading,
  error,
  cols = 90,
  onOpenMap,
}: WorldBandProps) {
  const grid = gridWithCols(cols);
  const points = events?.points;
  const buckets = useMemo(() => bucketEvents(grid, points ?? []), [grid, points]);

  const cells = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let ry = 0; ry < grid.rows; ry++) {
      for (let cx = 0; cx < grid.cols; cx++) {
        const c = ry * grid.cols + cx;
        const mark = cellMark(grid, buckets.counts, c);
        if (mark === "none") continue;
        const x = cx * PITCH + PITCH / 2;
        const y = ry * PITCH + PITCH / 2;
        out.push(
          mark === "solid" ? (
            <circle key={c} cx={x} cy={y} r={R_SOLID} className="ap-worldband__solid" />
          ) : (
            <circle key={c} cx={x} cy={y} r={R_HOLLOW} className="ap-worldband__hollow" />
          ),
        );
      }
    }
    return out;
  }, [grid, buckets]);

  const polled = hhmmUtc(events?.polledAt);
  const windowMin = events?.coverage.windowMinutes ?? 240;
  const hours = windowMin / 60;
  // Degraded polls are said out loud (graceful degradation, never fabricate): a poll that answered
  // but received nothing, located nothing, or ran without its store is not "live".
  const degraded: string[] = [];
  if (events) {
    const cov = events.coverage;
    if (cov.eventsReceived === 0) degraded.push("no events received in the window");
    else if (cov.eventsWithLocation === 0) degraded.push("no received event had a known location");
    if (events.source === "inprocess-fallback") {
      degraded.push("event store unavailable — in-process poll, nothing retained between polls");
    }
  }
  const state: "pending" | "unavailable" | "stale" | "degraded" | "live" = !events
    ? loading || !error
      ? "pending"
      : "unavailable"
    : error
      ? "stale"
      : degraded.length > 0
        ? "degraded"
        : "live";

  let caption: string;
  if (state === "pending") {
    caption = "Waiting for the first events poll — nothing recorded yet.";
  } else if (state === "unavailable") {
    caption = `Events source unavailable (${error}) — nothing to show.`;
  } else {
    const cov = events!.coverage;
    const outside = buckets.total - buckets.placed;
    caption =
      `${buckets.placed.toLocaleString("en-GB")} located public events in the rolling ${windowMin}-min window` +
      ` · ${cov.windowAiConfig.toLocaleString("en-GB")} on repos with AI config` +
      ` · a location was known for ${cov.locationCoveragePct}% of events received` +
      (outside > 0 ? ` · ${outside} outside the band's 74°N–56°S span` : "") +
      (degraded.length > 0 ? ` · ${degraded.join(" · ")}` : "") +
      (state === "stale" ? ` · last good poll ${polled ?? "unknown"}; the latest poll failed (${error})` : "");
  }

  return (
    <div className="ap-inset ap-worldband" data-testid="world-band" data-state={state}>
      <div className="ap-inset__head ap-inset__head--split">
        <span>Where events landed · last {hours}h</span>
        <span>GitHub + GitLab public events{polled && state !== "stale" ? ` · polled ${polled}` : ""}</span>
      </div>
      <button
        type="button"
        className="ap-worldband__stage"
        onClick={onOpenMap}
        aria-label="Open the full map"
        title="Open the full map"
      >
        <svg
          className="ap-worldband__svg"
          viewBox={`0 0 ${grid.cols * PITCH} ${grid.rows * PITCH}`}
          role="img"
          aria-label={caption}
        >
          {cells}
        </svg>
      </button>
      <div className="ap-worldband__foot">
        <p className="ap-worldband__cap">{caption}</p>
        <p className="ap-worldband__legend">
          solid = an event landed here · hollow = land, nothing recorded · tap the band for the full map
        </p>
        <p className="ap-worldband__attr">
          Land mask © OpenStreetMap contributors (ODbL), OpenFreeMap positron via OpenMapTiles, sampled{" "}
          {LAND_MASK_SAMPLED}. A cell is solid only when a located event&apos;s coordinates fall inside it.
        </p>
      </div>
    </div>
  );
});
