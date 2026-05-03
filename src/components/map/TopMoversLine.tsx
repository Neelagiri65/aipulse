"use client";

/**
 * TopMoversLine — single-line strip rendered above the LiveTicker on
 * the map / globe views. Calls `pickTopActiveCity` over the same live
 * point stream the map renders, and shows the city + count of the
 * most-active bucket in the current 4-hour window.
 *
 * Honest scope (S55): the underlying pipeline only retains 4h of
 * events, so "most active" reflects the trailing 4h, not 24h. The
 * component label says "last 4h" inline so the reader can't mistake
 * it for a 24h aggregate. When the storage window extends to 48h
 * (queued follow-up), this label updates in one place.
 *
 * Renders nothing when no live events have a recoverable city —
 * better to disappear than show "Most active: nowhere · 0 events".
 */

import * as React from "react";
import type { GlobePoint } from "@/components/globe/Globe";
import { pickTopActiveCity } from "@/lib/map/insights";

const ACTIVITY_WINDOW_LABEL = "last 4h";

export type TopMoversLineProps = {
  points: readonly GlobePoint[];
};

export function TopMoversLine({ points }: TopMoversLineProps): React.ReactElement | null {
  const top = React.useMemo(() => pickTopActiveCity(points), [points]);
  if (!top) return null;
  return (
    <div
      className="flex items-center justify-center gap-2 border-t border-border/40 bg-background/80 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/90 backdrop-blur-md"
      role="status"
      aria-label={`Most active region in the ${ACTIVITY_WINDOW_LABEL}: ${top.city} with ${top.count} events`}
    >
      <span className="text-muted-foreground/60">most active · {ACTIVITY_WINDOW_LABEL}:</span>
      <span className="text-foreground">{top.city}</span>
      <span className="text-muted-foreground/60">·</span>
      <span className="tabular-nums text-[#2dd4bf]">
        {top.count.toLocaleString()} {top.count === 1 ? "event" : "events"}
      </span>
    </div>
  );
}
