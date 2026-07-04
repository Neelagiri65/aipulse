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

import { GITHUB_EVENTS, OPENROUTER_RANKINGS } from "@/lib/data-sources";
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
    {
      // OpenRouter usage rankings — the S91 incident source. Probes the
      // STORED DTO the model-usage panel serves. generatedAt is stamped at
      // cron-write time (honest witness). The ordering check is the piece
      // every other signal missed for weeks: `catalogue-fallback` keeps
      // freshness/count green while the ranking product is blind.
      id: "openrouter-rankings",
      url: `${origin}/api/panels/model-usage`,
      extract: (p) => {
        const o = p as {
          ordering?: string;
          generatedAt?: string;
          rows?: unknown[];
        };
        if (!Array.isArray(o.rows)) {
          throw new Error("openrouter-rankings: rows[] missing");
        }
        return {
          observedAt: o.generatedAt ?? null,
          records: o.rows as Array<Record<string, unknown>>,
          ordering: o.ordering ?? null,
        };
      },
      contract: {
        maxAgeMinutes: freshnessBudget("openrouter-rankings"), // 360m × 2
        floor: 1,
        expectedMin: OPENROUTER_RANKINGS.sanityCheck.expectedMin,
        expectedMax: OPENROUTER_RANKINGS.sanityCheck.expectedMax,
        expectedOrdering: ["top-weekly", "trending"],
        verifiedAt: OPENROUTER_RANKINGS.verifiedAt,
      },
    },
    {
      // SDK Adoption matrix — the assembled packages DTO. Its top-level
      // generatedAt is stamped at ASSEMBLY (request) time — a self-clocking
      // timestamp that can never go stale (the F11 class) — so freshness is
      // witnessed by the NEWEST per-package `latest.fetchedAt`, i.e. "when
      // did we last hear from any pkg registry". Per-registry staleness
      // stays cron-health's job; this probe answers "is the panel fed at
      // all". No sanity range: row count = tracked-package count, a config
      // fact with no declared bounds — don't invent one.
      id: "sdk-adoption",
      url: `${origin}/api/panels/sdk-adoption`,
      extract: (p) => {
        const o = p as {
          packages?: Array<{ latest?: { fetchedAt?: string | null } }>;
        };
        if (!Array.isArray(o.packages)) {
          throw new Error("sdk-adoption: packages[] missing");
        }
        const fetchedAts = o.packages
          .map((pkg) => pkg.latest?.fetchedAt)
          .filter((t): t is string => typeof t === "string")
          .sort();
        return {
          observedAt: fetchedAts.length
            ? fetchedAts[fetchedAts.length - 1]
            : null,
          records: o.packages as Array<Record<string, unknown>>,
        };
      },
      contract: {
        maxAgeMinutes: freshnessBudget("pkg-pypi"), // all pkg crons 360m × 2
        floor: 1,
      },
    },
  ];
}
