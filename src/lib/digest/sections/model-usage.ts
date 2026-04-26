/**
 * Model Usage digest section composer.
 *
 * Consumes the OpenRouter snapshot history hash (date → top-N slugs)
 * and emits a "what moved this week on OpenRouter" section. Pure: no
 * Redis, no fetch, no Date.now beyond the optional `today` arg.
 *
 * Gating: returns `null` until the history has ≥7 distinct UTC days.
 * Below that threshold the digest section is silently omitted —
 * matches the trust contract (we don't speculate on rank movement
 * with one week of half-data).
 *
 * Three items per section when active:
 *   1. Biggest mover up (largest rank improvement over 7d).
 *   2. Biggest decliner (largest rank decline over 7d).
 *   3. Current top-3 today.
 *
 * Each item carries a `panelHref` that opens the standalone Model
 * Usage page with the row's drawer pre-selected — matching the SDK
 * Adoption deep-link pattern.
 */

import {
  OPENROUTER_SOURCE_CAVEAT,
  type ModelUsageSnapshotRow,
} from "@/lib/data/openrouter-types";
import type { DigestSection, DigestSectionItem } from "@/lib/digest/types";

const MIN_HISTORY_DAYS = 7;
const COMPARE_LOOKBACK_DAYS = 7;

export type ComposeModelUsageInput = {
  /** All known snapshot rows, keyed by UTC date YYYY-MM-DD. */
  snapshots: Record<string, ModelUsageSnapshotRow>;
  /** UTC date the digest is "for". Used as the head of the comparison. */
  today: string;
};

export function composeModelUsageSection(
  input: ComposeModelUsageInput,
): DigestSection | null {
  const { snapshots, today } = input;
  const datesPresent = Object.keys(snapshots).sort();

  if (datesPresent.length < MIN_HISTORY_DAYS) return null;

  const todayRow = snapshots[today];
  if (!todayRow || todayRow.slugs.length === 0) return null;

  // Walk backwards: prefer exactly 7 days back, but accept the
  // earliest snapshot in the last 7-8 days if the cron missed a fire.
  const yesterdayRow = pickComparisonSnapshot(snapshots, today);
  if (!yesterdayRow) return null;

  const todayRanks = rankMap(todayRow.slugs);
  const priorRanks = rankMap(yesterdayRow.slugs);

  const movers: Array<{ slug: string; from: number; to: number; delta: number }> = [];
  const decliners: Array<{ slug: string; from: number; to: number; delta: number }> = [];

  for (const [slug, toRank] of todayRanks) {
    const fromRank = priorRanks.get(slug);
    if (fromRank === undefined) continue; // new entrants excluded from movers
    const delta = fromRank - toRank; // positive = climbed
    if (delta > 0) movers.push({ slug, from: fromRank, to: toRank, delta });
    else if (delta < 0) decliners.push({ slug, from: fromRank, to: toRank, delta });
  }

  movers.sort(
    (a, b) => b.delta - a.delta || a.to - b.to,
  );
  decliners.sort(
    (a, b) => a.delta - b.delta || a.to - b.to,
  );

  const items: DigestSectionItem[] = [];

  const topMover = movers[0];
  if (topMover) {
    items.push(
      buildItem({
        headline: `${topMover.slug} climbed ${formatDelta(topMover.delta)} to #${topMover.to}`,
        detail: `was #${topMover.from} on ${yesterdayRow.date}`,
        slug: topMover.slug,
        includeCaveat: true,
      }),
    );
  }

  const topDecliner = decliners[0];
  if (topDecliner) {
    items.push(
      buildItem({
        headline: `${topDecliner.slug} slipped ${formatDelta(topDecliner.delta)} to #${topDecliner.to}`,
        detail: `was #${topDecliner.from} on ${yesterdayRow.date}`,
        slug: topDecliner.slug,
      }),
    );
  }

  for (let i = 0; i < Math.min(3, todayRow.slugs.length); i++) {
    const slug = todayRow.slugs[i];
    items.push(
      buildItem({
        headline: `#${i + 1} ${slug}`,
        slug,
      }),
    );
  }

  if (items.length === 0) return null;

  const headline = composeHeadline(todayRow, topMover, topDecliner);

  return {
    id: "model-usage",
    title: "Model Usage",
    anchorSlug: "model-usage",
    mode: "diff",
    headline,
    items,
    sourceUrls: ["https://openrouter.ai/rankings"],
  };
}

function pickComparisonSnapshot(
  snapshots: Record<string, ModelUsageSnapshotRow>,
  today: string,
): ModelUsageSnapshotRow | null {
  // Try exactly N days back first, then walk older within an 8-day
  // window to tolerate one missed cron fire.
  for (let offset = COMPARE_LOOKBACK_DAYS; offset <= COMPARE_LOOKBACK_DAYS + 1; offset++) {
    const cand = addDays(today, -offset);
    const row = snapshots[cand];
    if (row && row.slugs.length > 0) return row;
  }
  // Last resort: oldest snapshot strictly before `today` that has data.
  const dates = Object.keys(snapshots)
    .filter((d) => d < today)
    .sort();
  for (const d of dates) {
    const row = snapshots[d];
    if (row && row.slugs.length > 0) return row;
  }
  return null;
}

function rankMap(slugs: string[]): Map<string, number> {
  const m = new Map<string, number>();
  slugs.forEach((s, i) => m.set(s, i + 1));
  return m;
}

function buildItem(opts: {
  headline: string;
  detail?: string;
  slug: string;
  includeCaveat?: boolean;
}): DigestSectionItem {
  return {
    headline: opts.headline,
    detail: opts.detail,
    sourceLabel: "OpenRouter",
    sourceUrl: `https://openrouter.ai/${opts.slug}`,
    panelHref: `/panels/model-usage?focus=${encodeURIComponent(opts.slug)}`,
    caveat: opts.includeCaveat ? OPENROUTER_SOURCE_CAVEAT : undefined,
  };
}

function composeHeadline(
  todayRow: ModelUsageSnapshotRow,
  topMover: { slug: string; delta: number; to: number } | undefined,
  topDecliner: { slug: string; delta: number } | undefined,
): string {
  const top1 = todayRow.slugs[0];
  const moverClause = topMover
    ? `biggest mover: ${topMover.slug} ${formatDelta(topMover.delta)} to #${topMover.to}`
    : null;
  const declinerClause = topDecliner
    ? `biggest drop: ${topDecliner.slug} ${formatDelta(topDecliner.delta)}`
    : null;
  const tail = [moverClause, declinerClause].filter(Boolean).join(" · ");
  return tail
    ? `${top1} holds #1 · ${tail}`
    : `${top1} holds #1`;
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}`;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map((s) => Number.parseInt(s, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
