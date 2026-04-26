"use client";

/**
 * Floating map legend pinned to the bottom-left of the stage. Mirrors
 * the FilterPanel state: each entry is one of the active event-type
 * checkboxes, paired with the colour the map renders for that type.
 *
 * Hidden when no event types are active (e.g. user has all six off,
 * or signal-only ai-config-only is on without any types) — at that
 * point the AiConfigStrandedNote takes over the messaging.
 *
 * Cosmetic only — does not gate the points list.
 */

import * as React from "react";

import {
  EVENT_TYPE_FILTER_IDS,
  type EventTypeFilterId,
  type FilterState,
} from "@/components/chrome/FilterPanel";

const TYPE_LABEL: Record<EventTypeFilterId, string> = {
  push: "Push",
  pr: "PR",
  issue: "Issue",
  release: "Release",
  fork: "Fork",
  watch: "Star",
};

/**
 * Type → marker colour. Mirrors `colorForType` in FlatMap.tsx; if
 * that mapping changes, this one must too.
 */
const TYPE_COLOR: Record<EventTypeFilterId, string> = {
  push: "#2dd4bf",
  pr: "#60a5fa",
  issue: "#a78bfa",
  release: "#f59e0b",
  fork: "#4ade80",
  watch: "#fbbf24",
};

export type MapLegendProps = {
  filters: FilterState;
};

export function MapLegend({ filters }: MapLegendProps): React.ReactElement | null {
  const activeTypes = EVENT_TYPE_FILTER_IDS.filter(
    (id) => filters[id],
  );

  if (activeTypes.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Map legend — active event types"
      className="ap-map-legend pointer-events-none absolute bottom-4 left-4 rounded-md border border-border/40 bg-background/70 px-2 py-1.5 backdrop-blur-sm"
    >
      <div className="ap-map-legend-rows flex flex-col gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {activeTypes.map((id) => (
          <div key={id} className="ap-map-legend-row flex items-center gap-2">
            <span
              aria-hidden="true"
              className="ap-map-legend-dot inline-block rounded-full"
              style={{
                width: 7,
                height: 7,
                background: TYPE_COLOR[id],
                boxShadow: `0 0 5px ${TYPE_COLOR[id]}`,
              }}
            />
            <span className="ap-map-legend-label">{TYPE_LABEL[id]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
