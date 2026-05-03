"use client";

/**
 * TopMoversLine — single-line strip rendered above the LiveTicker on
 * the map / globe views.
 *
 * Two halves driven by the regional-deltas API (S56):
 *   - Fastest growing: <country> ↑X%   (24h vs 24h-prior, requires
 *                                       at least one snapshot to exist)
 *   - Most active:     <city> · N events  (current 24h)
 *
 * Bootstrap: the "fastest growing" half is suppressed until at least
 * one daily snapshot has been written (24h after deploy). The "most
 * active" half renders from day-1 since it only needs the live 24h
 * window, no comparison data.
 *
 * Falls back to the S55 client-side `pickTopActiveCity(points)` only
 * when the `regionalDeltas` prop is undefined — keeps the panel alive
 * during the brief interval between Slice 5 deploy and Slice 4's first
 * cron run.
 */

import * as React from "react";
import type { GlobePoint } from "@/components/globe/Globe";
import { pickTopActiveCity } from "@/lib/map/insights";

export type RegionalDelta = {
  current24h: number;
  prior24h: number | null;
  deltaPct: number | null;
};

export type RegionalDeltasDto = {
  generatedAt: string;
  windowHours: 24;
  byCountry: Record<string, RegionalDelta>;
  topGrowingCountry: { country: string; deltaPct: number } | null;
  mostActiveCity: { city: string; count: number } | null;
};

export type TopMoversLineProps = {
  /** Live globe points — used as a fallback for "most active" when the
   *  regionalDeltas prop is undefined (e.g. endpoint not yet polled). */
  points: readonly GlobePoint[];
  regionalDeltas?: RegionalDeltasDto | null;
};

export function TopMoversLine({
  points,
  regionalDeltas,
}: TopMoversLineProps): React.ReactElement | null {
  const fallbackTop = React.useMemo(
    () => (regionalDeltas ? null : pickTopActiveCity(points)),
    [points, regionalDeltas],
  );

  const mostActive = regionalDeltas?.mostActiveCity ?? fallbackTop;
  const fastestGrowing = regionalDeltas?.topGrowingCountry ?? null;

  if (!mostActive && !fastestGrowing) return null;

  const ariaParts: string[] = [];
  if (fastestGrowing) {
    ariaParts.push(
      `Fastest growing: ${fastestGrowing.country} up ${formatDeltaPct(fastestGrowing.deltaPct)}`,
    );
  }
  if (mostActive) {
    ariaParts.push(
      `Most active: ${mostActive.city} with ${mostActive.count} events`,
    );
  }

  return (
    <div
      className="flex items-center justify-center gap-3 border-t border-border/40 bg-background/80 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/90 backdrop-blur-md"
      role="status"
      aria-label={ariaParts.join(" · ")}
    >
      {fastestGrowing ? (
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground/60">fastest growing:</span>
          <span className="text-foreground">{fastestGrowing.country}</span>
          <DeltaArrow pct={fastestGrowing.deltaPct} />
        </span>
      ) : null}
      {fastestGrowing && mostActive ? (
        <span className="text-muted-foreground/40">·</span>
      ) : null}
      {mostActive ? (
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground/60">most active:</span>
          <span className="text-foreground">{mostActive.city}</span>
          <span className="tabular-nums text-[#2dd4bf]">
            {mostActive.count.toLocaleString()}{" "}
            {mostActive.count === 1 ? "event" : "events"}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function DeltaArrow({ pct }: { pct: number }): React.ReactElement {
  const up = pct >= 0;
  const colour = up ? "text-emerald-300" : "text-red-300";
  const arrow = up ? "↑" : "↓";
  return (
    <span className={`tabular-nums ${colour}`}>
      {arrow}
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

function formatDeltaPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(Math.round(pct))} percent`;
}
