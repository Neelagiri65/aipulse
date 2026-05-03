/**
 * Map-insights helpers — pure aggregations over the live-events point
 * stream that feed two visible UI surfaces:
 *
 *   1. `pickTopActiveCity` → drives the "Most active: <city> · N events"
 *      strip rendered above the LiveTicker. Aggregates live-event points
 *      by their geocoded city (recovered via `cityFromCoords` against
 *      the existing geocoder dictionary), returns the city with the
 *      highest event count plus that count. Returns null when no
 *      live events have a known city.
 *
 *   2. `summariseClusterTypes` → drives the per-type breakdown line at
 *      the top of the cluster popup. Aggregates `meta.type` across the
 *      cluster's live events into a label list ordered by count desc.
 *      Friendly labels for the common GH event types; everything else
 *      collapses into "other".
 *
 * Both pure — same input, same output. Sized for the realistic event
 * volume (~1000 points per render); no early-exit needed.
 *
 * Honest scope: the aggregation window is bounded by what the upstream
 * pipeline stores, currently 4h (`WINDOW_MINUTES = 240` in
 * fetch-events.ts). The "most active" line therefore reflects the
 * trailing 4h, NOT 24h. Storage extension to 48h is queued as a
 * separate follow-up — surfacing fake-24h aggregates over 4h data
 * would violate the trust contract.
 */

import type { GlobePoint } from "@/components/globe/Globe";
import { cityFromCoords } from "@/lib/geocoding";

/** Result of the "most active city" aggregation. `null` when no live
 *  events in the input had a recoverable city label. */
export type TopActiveCity = {
  city: string;
  count: number;
};

/**
 * Find the city with the most live events in the current window.
 * Live events are GlobePoints whose meta.kind is undefined or "event"
 * (registry / lab / hn / rss layers are excluded — they aren't a
 * "real-time activity" signal, they're persistent overlays).
 *
 * Ties broken alphabetically by city name (deterministic).
 */
export function pickTopActiveCity(
  points: readonly GlobePoint[],
): TopActiveCity | null {
  const counts = new Map<string, number>();
  for (const p of points) {
    if (!isLiveEvent(p)) continue;
    const city = cityFromCoords(p.lat, p.lng);
    if (!city) continue;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let top: TopActiveCity = { city: "", count: -1 };
  for (const [city, count] of counts) {
    if (count > top.count || (count === top.count && city < top.city)) {
      top = { city, count };
    }
  }
  return top;
}

export type ClusterTypeBreakdown = Array<{
  /** Friendly label, plural-ready (e.g. "push", "PR", "issue"). */
  label: string;
  count: number;
}>;

/**
 * Aggregate live-event types within a cluster into ordered breakdown
 * rows. Returns `[]` when the cluster has no live events (pure
 * registry / lab / hn / rss popups don't get a type strip).
 *
 * Friendly label mapping covers the common GH event types in the
 * stream; rare types fold into "other" so the strip stays readable.
 */
export function summariseClusterTypes(
  events: readonly GlobePoint[],
): ClusterTypeBreakdown {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!isLiveEvent(e)) continue;
    const type = (e.meta as { type?: string } | undefined)?.type;
    const label = friendlyLabel(type);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, z) => z.count - a.count || a.label.localeCompare(z.label));
}

/** Format the breakdown as a single bullet-separated line, with the
 *  count prefixed and the label pluralised by count. */
export function formatBreakdownLine(rows: ClusterTypeBreakdown): string {
  if (rows.length === 0) return "";
  return rows
    .map((r) => `${r.count} ${pluralise(r.label, r.count)}`)
    .join(" · ");
}

function isLiveEvent(p: GlobePoint): boolean {
  const kind = (p.meta as { kind?: string } | undefined)?.kind;
  return kind === undefined || kind === "event";
}

const TYPE_LABELS: Record<string, string> = {
  PushEvent: "push",
  PullRequestEvent: "PR",
  IssuesEvent: "issue",
  ReleaseEvent: "release",
  WatchEvent: "star", // GH names this WatchEvent but the action is "starred"
  ForkEvent: "fork",
  IssueCommentEvent: "comment",
  PullRequestReviewEvent: "review",
  PullRequestReviewCommentEvent: "review comment",
  CreateEvent: "create",
  DeleteEvent: "delete",
};

function friendlyLabel(type: string | undefined): string {
  if (!type) return "other";
  return TYPE_LABELS[type] ?? "other";
}

/** Pluralisation rules: "PR" → "PRs", "review comment" → "review comments",
 *  "push" → "pushes" (sibilant -es), "star" → "stars". Single-count
 *  returns the singular as-is. */
function pluralise(label: string, count: number): string {
  if (count === 1) return label;
  if (/(s|sh|ch|x|z)$/.test(label)) return `${label}es`;
  return `${label}s`;
}

/** Resolved delta for a single cluster. `null` when the cluster doesn't
 *  qualify for an indicator (too small / no labelled country / no prior
 *  data / movement under the noise floor). */
export type ClusterDelta = {
  country: string;
  deltaPct: number;
};

/**
 * Per-cluster delta resolution for the map's bubble indicators.
 *
 * Three guard rails (S57 spec — match the trust contract used by
 * `topGrowingCountry` in /api/globe-events/regional-deltas):
 *   1. Cluster has at least `minEvents` (default 10) labelled live
 *      events. Smaller clusters can't honestly attribute "regional
 *      growth" — a 2-event cluster going from 1→2 is sampling noise.
 *   2. Dominant country in the cluster has a non-null deltaPct in
 *      `byCountry` (i.e. there's prior-window data to compare against).
 *   3. |deltaPct| meets `minPct` (default 5). Below that the indicator
 *      adds visual noise without conveying movement.
 *
 * "Dominant country" = the country with the most labelled live events
 * in the cluster. Ties broken alphabetically (deterministic).
 *
 * Returns null when any guard rail fails. The map renders the existing
 * count label only — no fake indicator, no synthesised delta.
 */
export type PickClusterDeltaOptions = {
  minEvents?: number;
  minPct?: number;
};

const DEFAULT_MIN_EVENTS = 10;
const DEFAULT_MIN_PCT = 5;

export function pickClusterDelta(
  events: readonly GlobePoint[],
  byCountry: Record<string, { deltaPct: number | null }> | null | undefined,
  opts: PickClusterDeltaOptions = {},
): ClusterDelta | null {
  if (!byCountry) return null;
  const minEvents = opts.minEvents ?? DEFAULT_MIN_EVENTS;
  const minPct = opts.minPct ?? DEFAULT_MIN_PCT;

  const countryCounts = new Map<string, number>();
  for (const e of events) {
    if (!isLiveEvent(e)) continue;
    const country = (e.meta as { country?: string | null } | undefined)
      ?.country;
    if (!country) continue;
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
  }
  if (countryCounts.size === 0) return null;

  let dominant: { country: string; count: number } = { country: "", count: 0 };
  for (const [country, count] of countryCounts) {
    if (
      count > dominant.count ||
      (count === dominant.count && country < dominant.country)
    ) {
      dominant = { country, count };
    }
  }
  if (dominant.count < minEvents) return null;

  const delta = byCountry[dominant.country]?.deltaPct;
  if (delta === null || delta === undefined) return null;
  if (Math.abs(delta) < minPct) return null;

  return { country: dominant.country, deltaPct: delta };
}

/** Compact delta label for the cluster icon: "↑12%" / "↓8%". */
export function formatClusterDelta(d: ClusterDelta): string {
  const arrow = d.deltaPct >= 0 ? "↑" : "↓";
  return `${arrow}${Math.abs(Math.round(d.deltaPct))}%`;
}
