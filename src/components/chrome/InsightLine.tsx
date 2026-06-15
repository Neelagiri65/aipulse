"use client";

import type { PanelInsight } from "@/lib/panels/insights";

/**
 * One-line panel insight rendered in the `Win.insight` slot, directly under
 * the StatBar. The sentence sits at fg-dim; the source trace follows at a
 * lower opacity so every number on the line stays attributable without
 * shouting.
 *
 * Pure presentational — derivation lives in `@/lib/panels/insights`. Renders
 * nothing when `insight` is null so a panel never shows a fabricated line.
 */
export function InsightLine({ insight }: { insight: PanelInsight | null }) {
  if (!insight) return null;
  return (
    <div className="ap-win__insight">
      <span className="ap-win__insight-text">{insight.text}</span>
      <span className="ap-win__insight-source"> · {insight.source}</span>
    </div>
  );
}
