/**
 * Pure mapping from LabActivity[] → GlobePoint[].
 *
 * Every lab shows up on the globe at its HQ coord as a violet dot. Size
 * scales log-linearly from LABS_MIN_SIZE at zero activity up to
 * LABS_MAX_SIZE at the 95th-percentile activity across the current run
 * — so one outlier lab with 10k events can't squash the rest of the
 * distribution to dots. Zero-activity labs are tagged `labInactive: true`
 * so the renderer can dim them (LABS_INACTIVE_OPACITY) while keeping
 * the dot present and clickable.
 *
 * Deterministic: same input always yields the same output. Tests at
 * `labs-to-points.test.ts` pin the contract.
 */

import type { GlobePoint } from "@/components/globe/Globe";
import type { LabActivity } from "@/lib/data/fetch-labs";

export const LABS_VIOLET = "#a855f7";
export const LABS_MIN_SIZE = 0.3;
export const LABS_MAX_SIZE = 1.2;
export const LABS_INACTIVE_OPACITY = 0.35;

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor(sortedAsc.length * p)),
  );
  return sortedAsc[idx];
}

export function labsToGlobePoints(labs: LabActivity[]): GlobePoint[] {
  if (labs.length === 0) return [];

  const totals = labs.map((l) => l.total).sort((a, b) => a - b);
  const p95 = Math.max(1, percentile(totals, 0.95));
  const logMax = Math.log(1 + p95);
  const sizeFor = (total: number): number => {
    if (total <= 0) return LABS_MIN_SIZE;
    const ratio = Math.min(1, Math.log(1 + total) / logMax);
    return LABS_MIN_SIZE + (LABS_MAX_SIZE - LABS_MIN_SIZE) * ratio;
  };

  return labs.map((lab) => ({
    lat: lab.lat,
    lng: lab.lng,
    color: LABS_VIOLET,
    size: sizeFor(lab.total),
    meta: {
      kind: "lab",
      labId: lab.id,
      displayName: lab.displayName,
      labKind: lab.kind,
      labCity: lab.city,
      labCountry: lab.country,
      labTotal: lab.total,
      labByType: lab.byType,
      labRepos: lab.repos,
      labOrgs: lab.orgs,
      labHqSourceUrl: lab.hqSourceUrl,
      labUrl: lab.url,
      labStale: lab.stale,
      labInactive: lab.total === 0,
    },
  }));
}
