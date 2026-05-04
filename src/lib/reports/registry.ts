/**
 * Genesis Report registry — slug → config lookup.
 *
 * Each Genesis Report is a typed config in `src/lib/reports/<slug>.ts`.
 * The registry is a flat record: adding a new report is one import
 * and one map entry. Unknown slugs return null; the route consumer
 * calls `notFound()` on null.
 *
 * Future shape (Genesis #2+): if the report cadence happens, a
 * lightweight index page at `/reports` can iterate this map. Out of
 * scope for the first launch.
 */

import type { GenesisReportConfig } from "@/lib/reports/types";
import { report202604Tooling } from "@/lib/reports/2026-04-tooling";

const REGISTRY: Record<string, GenesisReportConfig> = {
  [report202604Tooling.slug]: report202604Tooling,
};

export function getReportConfig(slug: string): GenesisReportConfig | null {
  return REGISTRY[slug] ?? null;
}

/** Sorted list of registered slugs. Stable for tests. */
export function listReportSlugs(): string[] {
  return Object.keys(REGISTRY).sort();
}
