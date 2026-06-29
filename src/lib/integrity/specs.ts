/**
 * Integrity layer — the source registry.
 *
 * One `RunnableSpec` per verifiable output. Each declares HOW to read the
 * live payload (`extract`) and the pre-committed contract it must satisfy.
 * Contract values are sourced from the existing source of truth, not
 * invented here:
 *   - freshness budgets mirror `cron-health.ts` declared intervals (× 2,
 *     matching its own staleness gate);
 *   - `verifiedAt` is read from the `data-sources.ts` registry entry;
 *   - sanity ranges, where a meaningful one exists for the OUTPUT metric,
 *     come from that entry's `sanityCheck`.
 *
 * Start small and honest: only outputs whose live shape is confirmed are
 * listed. Adding a source is a one-object change — that is the point.
 */

import { GITHUB_EVENTS } from "@/lib/data-sources";
import { CRON_WORKFLOWS, type CronWorkflowName } from "@/lib/data/cron-health";
import type { RunnableSpec } from "./run";

/** Public origin to probe. The watchdog runs against prod; override via
 *  the runner when probing a preview deployment. */
export const PROBE_ORIGIN = "https://gawk.dev";

/** Freshness budget for an output backed by a cron, read from the SAME
 *  declared cadence cron-health uses (× 2, matching its staleness gate) so
 *  the two staleness systems can never drift apart. No parallel truth. */
export function freshnessBudget(workflow: CronWorkflowName): number {
  return CRON_WORKFLOWS[workflow].expectedIntervalMinutes * 2;
}

export function buildProbeSpecs(origin = PROBE_ORIGIN): RunnableSpec[] {
  return [
    {
      // The globe — gawk's public face. Every dot must be a real event
      // (not fabricated), the poll must be recent, and there must be dots.
      // Globe points carry no per-point `source` field, so provenance is
      // intentionally omitted; not-fabricated + verified-source guard it.
      id: "globe-events",
      url: `${origin}/api/globe-events`,
      extract: (p) => {
        const o = p as { points?: unknown[]; polledAt?: string };
        if (!Array.isArray(o.points)) {
          throw new Error("globe-events: points[] missing");
        }
        return {
          observedAt: o.polledAt ?? null,
          records: o.points as Array<Record<string, unknown>>,
        };
      },
      contract: {
        maxAgeMinutes: freshnessBudget("globe-ingest"), // 90m × 2
        floor: 1,
        checkFabrication: true,
        verifiedAt: GITHUB_EVENTS.verifiedAt,
      },
    },
    {
      // The dashboard feed. Each card must carry a sourceUrl (the "every
      // number traces to a source" non-negotiable), the feed must be
      // freshly computed, and it must be non-empty.
      id: "feed",
      url: `${origin}/api/feed`,
      extract: (p) => {
        const o = p as { cards?: unknown[]; lastComputed?: string };
        if (!Array.isArray(o.cards)) {
          throw new Error("feed: cards[] missing");
        }
        return {
          observedAt: o.lastComputed ?? null,
          records: o.cards as Array<Record<string, unknown>>,
        };
      },
      contract: {
        maxAgeMinutes: 360,
        floor: 1,
        provenanceField: "sourceUrl",
      },
    },
  ];
}
