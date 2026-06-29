/**
 * Gawk — degraded-source detection
 *
 * Pure projection from loaded snapshots to the set of sources currently
 * serving a DEGRADED fallback. Kept separate from `load.ts` (which does
 * live I/O and isn't unit-tested) so the branching logic is testable.
 *
 * Today there is exactly one degraded mode worth surfacing: OpenRouter
 * on `catalogue-fallback` WITH rows. That means the frontend ranking
 * fetch failed and we're serving catalogue order — real models, but not
 * a usage ranking — so MODEL_MOVER is deliberately suppressed and the
 * Models tile would otherwise read as "quiet" when it's actually blind.
 *
 * The `rows.length > 0` guard is load-bearing: `catalogue-fallback` with
 * ZERO rows is the cold-start / "cron hasn't run" default (see load.ts),
 * which is genuine no-data, NOT a live degradation to flag.
 */

import type { ModelUsageDto } from "@/lib/data/openrouter-types";
import type { DegradedSource } from "@/lib/feed/types";

/** Canonical source name for the OpenRouter ranking feed (matches the deriver). */
export const OPENROUTER_SOURCE_NAME = "OpenRouter";

export function deriveDegradedSources(args: {
  models: Pick<ModelUsageDto, "ordering" | "rows">;
}): DegradedSource[] {
  const out: DegradedSource[] = [];

  const { ordering, rows } = args.models;
  if (ordering === "catalogue-fallback" && rows.length > 0) {
    out.push({
      source: OPENROUTER_SOURCE_NAME,
      reason:
        "ranking source degraded — showing catalogue order; rank movements unavailable",
    });
  }

  return out;
}
