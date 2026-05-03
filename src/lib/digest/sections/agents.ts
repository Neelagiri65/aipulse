/**
 * Agents-frameworks digest section composer.
 *
 * Movement-gated: returns null in bootstrap (no 7d-old data → no row has
 * a delta yet), null when no row's |delta| exceeds the threshold, and a
 * populated DigestSection only when there's something to say. Tombstones
 * (legacy / dormant / archived) are excluded from the movement check
 * because a dead project's number going up is a methodology artefact,
 * not an ecosystem signal.
 *
 * The 10% threshold is a guess — we have no observed delta history yet.
 * Per PRD §10 the plan is to ship at this number, log 14 days, and retune
 * empirically. The constant lives as a single named export so the
 * follow-up PR is one line.
 */

import type { DigestSection, DigestSectionItem } from "@/lib/digest/types";
import type { AgentsViewDto, AgentRowView } from "@/lib/data/agents-view";

/** Initial threshold — retune after 14 days of observed deltas (PRD §10). */
export const AGENTS_MOVEMENT_THRESHOLD_PCT = 10;

const PYPISTATS_BASE = "https://pypistats.org/packages/";
const NPM_BASE = "https://www.npmjs.com/package/";
const GH_BASE = "https://github.com/";

export type ComposeAgentsSectionInput = {
  agents: AgentsViewDto | null;
  /** Test-only override of the threshold. */
  thresholdPct?: number;
};

export function composeAgentsSection(
  input: ComposeAgentsSectionInput,
): DigestSection | null {
  if (!input.agents) return null;
  const threshold = input.thresholdPct ?? AGENTS_MOVEMENT_THRESHOLD_PCT;

  const movers = input.agents.rows.filter(
    (r) => r.badge === null && isMover(r, threshold),
  );

  if (movers.length === 0) return null;

  const sorted = [...movers].sort((a, b) => moverRank(b) - moverRank(a));
  const items: DigestSectionItem[] = sorted.map(buildItem);
  const sourceUrls = dedup(
    items.map((i) => i.sourceUrl).filter((u): u is string => Boolean(u)),
  );

  return {
    id: "agents",
    title: "Agent frameworks",
    anchorSlug: "agents",
    mode: "diff",
    headline: `${movers.length} agent framework${movers.length === 1 ? "" : "s"} moved >${Math.round(threshold)}% in the last week`,
    items,
    sourceUrls,
  };
}

function isMover(row: AgentRowView, threshold: number): boolean {
  if (row.deltaState === "new-from-zero") return true;
  if (row.weeklyDeltaPct === null) return false;
  return Math.abs(row.weeklyDeltaPct) > threshold;
}

/** Sort key for movement: new-from-zero ranks just below the largest
 *  observed |delta|, since we can't compare a "+new" to a number but it's
 *  obviously material. Use a sentinel large enough to outrank ordinary
 *  movement but not so large it always sits at the very top regardless
 *  of competition. */
function moverRank(row: AgentRowView): number {
  if (row.deltaState === "new-from-zero") return 1_000;
  return Math.abs(row.weeklyDeltaPct ?? 0);
}

function buildItem(row: AgentRowView): DigestSectionItem {
  const headline = formatHeadline(row);
  const detail = formatDetail(row);
  const { sourceLabel, sourceUrl } = sourceFor(row);
  return {
    headline,
    detail,
    sourceLabel,
    sourceUrl,
    panelHref: `/panels/agents?focus=${encodeURIComponent(row.id)}`,
    caveat: row.caveat ?? undefined,
  };
}

function formatHeadline(row: AgentRowView): string {
  if (row.deltaState === "new-from-zero") {
    return `${row.name} · new this week`;
  }
  const pct = row.weeklyDeltaPct as number;
  const sign = pct > 0 ? "+" : "";
  return `${row.name} · ${sign}${pct.toFixed(0)}%`;
}

function formatDetail(row: AgentRowView): string | undefined {
  if (row.weeklyDownloads === null) return undefined;
  const wd = formatCount(row.weeklyDownloads);
  return `${wd} weekly downloads · ${row.stars !== null ? formatCount(row.stars) + " stars" : "stars unavailable"}`;
}

function sourceFor(row: AgentRowView): {
  sourceLabel: string;
  sourceUrl?: string;
} {
  // Prefer PyPI as the primary citation when present (it's where the
  // largest single number lives for every multi-language framework in
  // the slate). Fall back to npm, then to the GH repo for tombstones.
  if (row.pypiPackage) {
    return {
      sourceLabel: "pypistats.org",
      sourceUrl: `${PYPISTATS_BASE}${encodeURIComponent(row.pypiPackage)}`,
    };
  }
  if (row.npmPackage) {
    return {
      sourceLabel: "npm",
      sourceUrl: `${NPM_BASE}${row.npmPackage}`,
    };
  }
  return {
    sourceLabel: "GitHub",
    sourceUrl: `${GH_BASE}${row.githubRepo}`,
  };
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function dedup(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
