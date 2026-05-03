/**
 * Last-incident recap helper for the Tool Health cards (S58 build 2).
 *
 * Walks the 7-day DayBucket history and returns the most-recent
 * incident (by createdAt) plus its computed duration + display metadata.
 * Returns `kind: "none"` when no incidents exist in the window — the
 * card renders "No incidents in 7d" rather than a sparse "—".
 *
 * Pure: same input → same output. No I/O. The DayBucket history comes
 * from the existing `fetchHistoricalIncidents` pipeline; no new ingest
 * needed.
 *
 * Trust contract: every field cites the source incident. Duration is
 * computed (resolvedAt - createdAt), never estimated. Ongoing incidents
 * (no resolvedAt) surface as `durationMinutes: null` so the card can
 * render "ongoing" instead of fabricating a duration.
 */

import type {
  DayBucket,
  HistoricalIncident,
  IncidentImpact,
} from "@/lib/data/status-history";

export type LastIncidentRecap =
  | {
      kind: "incident";
      /** ISO timestamp when the incident was first reported. */
      createdAt: string;
      /** ISO timestamp when resolved. `null` for ongoing incidents. */
      resolvedAt: string | null;
      /** Duration in minutes from createdAt → resolvedAt. `null` when ongoing. */
      durationMinutes: number | null;
      /** Statuspage lifecycle status: investigating / identified / monitoring / resolved. */
      status: string;
      /** Statuspage impact severity. */
      impact: IncidentImpact;
      /** Incident name from the upstream status page. */
      name: string;
    }
  | { kind: "none" };

export function pickLastIncident(
  history: readonly DayBucket[] | undefined,
): LastIncidentRecap {
  if (!history || history.length === 0) return { kind: "none" };

  // Flatten all incidents across the buckets, dedupe by id (the same
  // incident can overlap two adjacent days).
  const seen = new Map<string, HistoricalIncident>();
  for (const day of history) {
    for (const inc of day.incidents) {
      if (!seen.has(inc.id)) seen.set(inc.id, inc);
    }
  }
  if (seen.size === 0) return { kind: "none" };

  // Most recent by createdAt — descending sort, take first.
  const latest = Array.from(seen.values()).sort((a, z) =>
    z.createdAt.localeCompare(a.createdAt),
  )[0];

  const createdMs = Date.parse(latest.createdAt);
  const resolvedMs = latest.resolvedAt ? Date.parse(latest.resolvedAt) : null;
  const durationMinutes =
    resolvedMs !== null && Number.isFinite(createdMs) && Number.isFinite(resolvedMs)
      ? Math.max(0, Math.round((resolvedMs - createdMs) / 60_000))
      : null;

  return {
    kind: "incident",
    createdAt: latest.createdAt,
    resolvedAt: latest.resolvedAt ?? null,
    durationMinutes,
    status: latest.status,
    impact: latest.impact,
    name: latest.name,
  };
}

/** Compact duration label: "12 min" / "2h 15min" / "1d 4h". */
export function formatIncidentDuration(minutes: number | null): string {
  if (minutes === null) return "ongoing";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) {
    return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/** Friendly label for the impact severity, matching the SeverityPill copy. */
export function formatIncidentImpact(impact: IncidentImpact): string {
  switch (impact) {
    case "critical":
      return "major outage";
    case "major":
      return "partial outage";
    case "minor":
      return "degraded";
    case "none":
      return "no impact";
    default:
      return impact;
  }
}
