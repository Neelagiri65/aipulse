/**
 * Genesis Report block — top AI Labs by GitHub activity over a window.
 *
 * Pure transform over the existing `LabsPayload` (assembled by
 * `fetchLabActivity` and consumed today by the AI Labs panel + the
 * /lab/[slug] entity routes). Sorts by total event count, takes
 * top-N, formats rows with the lab's HQ + GitHub-org link.
 *
 * Window note: `fetchLabActivity` defaults to a rolling 7-day window
 * — the underlying GH Events API only exposes the most recent ~90
 * events per repo, which doesn't reliably stretch to 30 days for
 * busy repos. We accept the data's own honest window here: the
 * block id says "30d" for catalogue consistency with the rest of
 * the Genesis Report, but the actual window is whatever the labs
 * payload was assembled for. The framing prose (operator-written)
 * should match the live window once the report is launch-ready.
 *
 * Trust contract:
 *   - Per-row sourceUrl is the lab's primary website (LabActivity.url)
 *     — the click target users see when they tap the lab name.
 *   - HQ city + country printed in the row label so geographic
 *     spread is visible at a glance.
 *   - Stale flag surfaced as a sanity warning per row when any of
 *     the lab's tracked repos failed to fetch — never invents
 *     "0 events" when the truth is "we don't know".
 *   - When the payload has zero qualifying labs (all activity
 *     totals = 0), returns rows: [] (honest empty, no fabrication).
 *
 * Pure: no IO, no clock reads (callers pass `now`).
 */

import type { GenesisBlockResult, GenesisBlockRow } from "@/lib/reports/types";
import type { LabActivity, LabsPayload } from "@/lib/data/fetch-labs";

const DEFAULT_TOP_N = 5;

export type LabsLeadersBlockInput = {
  payload: LabsPayload;
  topN?: number;
  now?: () => Date;
};

export function loadLabsActivityLeaders30dBlock(
  input: LabsLeadersBlockInput,
): GenesisBlockResult {
  const topN = input.topN ?? DEFAULT_TOP_N;
  const now = (input.now ?? (() => new Date()))();

  // Strictly positive total only — labs that were tracked but quiet
  // don't make a "leaders" framing.
  const candidates = input.payload.labs.filter((l) => l.total > 0);
  candidates.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    // Tie-breaker: prefer non-stale labs (complete data > partial).
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
  const top = candidates.slice(0, topN);

  const rows: GenesisBlockRow[] = top.map((lab) => labToRow(lab));

  const sanityWarnings: string[] = [];
  for (const lab of top) {
    if (lab.stale) {
      sanityWarnings.push(
        `${lab.displayName}: at least one tracked repo failed to fetch — total reflects partial data only.`,
      );
    }
  }

  return {
    rows,
    generatedAt: now.toISOString(),
    sanityWarnings,
  };
}

function labToRow(lab: LabActivity): GenesisBlockRow {
  return {
    label: `${lab.displayName} · ${lab.city}, ${lab.country}`,
    value: `${lab.total.toLocaleString()} events`,
    sourceUrl: lab.url,
    sourceLabel: hostnameOf(lab.url),
  };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
