/**
 * Genesis Report block — agent-framework velocity (top movers by
 * weekly download delta).
 *
 * Pure transform over the existing `AgentsViewDto` (assembled by
 * `assembleAgentsView` and consumed today by the agents panel +
 * the daily digest agents section). Sorts by `weeklyDeltaPct`
 * descending (positive = momentum), takes top-N.
 *
 * Naming note: the block id says "30d" for catalogue consistency
 * with the rest of the Genesis Report, but the upstream signal is
 * a w/w delta (`weeklyDeltaPct`). The framing prose (operator-
 * written) should match the actual cadence — "weekly velocity",
 * not "monthly velocity".
 *
 * Trust contract:
 *   - Per-row `sourceUrl` is the framework's GitHub repo (the click
 *     target the panel uses today).
 *   - Per-row `caveat` is the framework's existing `caveat` (e.g.
 *     "PyPI counts via pypistats — third-party aggregator").
 *   - Stale rows surface a sanity warning per row + still ship the
 *     value (with the staleness flag). Honest gap > comfortable lie.
 *   - Archived frameworks are EXCLUDED from "velocity" framing
 *     (their repo is dead; weekly downloads is residual / mirror
 *     traffic, not real momentum).
 *
 * Pure: no IO, no clock reads (callers pass `now`).
 */

import type { GenesisBlockResult, GenesisBlockRow } from "@/lib/reports/types";
import type { AgentsViewDto, AgentRowView } from "@/lib/data/agents-view";

const DEFAULT_TOP_N = 5;

export type AgentsVelocityBlockInput = {
  view: AgentsViewDto;
  topN?: number;
  now?: () => Date;
};

export function loadAgentsVelocity30dBlock(
  input: AgentsVelocityBlockInput,
): GenesisBlockResult {
  const topN = input.topN ?? DEFAULT_TOP_N;
  const now = (input.now ?? (() => new Date()))();

  // Filter: must have a non-null weeklyDeltaPct, must NOT be
  // archived (a "velocity" framing requires a live framework).
  const candidates = input.view.rows.filter(
    (r) =>
      r.weeklyDeltaPct !== null &&
      r.archived !== true,
  );
  // Sort by absolute movement, biggest movers first regardless of
  // direction — the editorial framing (operator-written) decides
  // whether to lead with gainers or both. Tie-break by name for
  // stable ranking.
  candidates.sort((a, b) => {
    const dA = Math.abs(a.weeklyDeltaPct as number);
    const dB = Math.abs(b.weeklyDeltaPct as number);
    if (dB !== dA) return dB - dA;
    return a.id.localeCompare(b.id);
  });
  const top = candidates.slice(0, topN);

  const rows: GenesisBlockRow[] = top.map((r) => agentToRow(r));

  const sanityWarnings: string[] = [];
  for (const r of top) {
    if (r.weeklyDownloadsStaleSince) {
      sanityWarnings.push(
        `${r.name}: weekly-downloads source is stale since ${r.weeklyDownloadsStaleSince} — w/w delta reflects last-known values, not live readings.`,
      );
    }
  }

  return {
    rows,
    generatedAt: now.toISOString(),
    sanityWarnings,
  };
}

function agentToRow(r: AgentRowView): GenesisBlockRow {
  const delta = r.weeklyDeltaPct as number;
  const sign = delta > 0 ? "+" : "";
  return {
    label: r.name,
    value: r.weeklyDownloads
      ? `${formatCount(r.weeklyDownloads)} weekly downloads`
      : "—",
    delta: `${sign}${delta.toFixed(1)}% w/w`,
    sourceUrl: `https://github.com/${r.githubRepo}`,
    sourceLabel: "github.com",
    caveat: r.caveat ?? undefined,
  };
}

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
