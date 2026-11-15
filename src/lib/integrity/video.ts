/**
 * Integrity layer — the video output probe (pure).
 *
 * The daily-video job goes green on mp4 existence, NOT on upload success,
 * so it can publish nothing and still report success. The only honest
 * check is against the OUTPUT itself: the most recent upload-log entry
 * must be recent AND the video must actually resolve on YouTube. The route
 * performs the I/O (read upload-log, call oEmbed) and passes the results
 * here; this function stays pure and testable.
 *
 * Pause: when someone has disabled the daily-video workflow on GitHub, an
 * old last upload is the expected state, not a fault, so it does not read
 * STALE. The pause is read from the workflow's live state (never declared
 * in code), so re-enabling the workflow restores the staleness check with
 * no code change. The `playable` check is unaffected: the last video must
 * still resolve.
 */

import { buildReport, checkFreshness, type IntegrityReport } from "./checks";

export type UploadLogEntry = {
  date: string;
  url: string;
  visibility?: string;
};

/** Is this GitHub "get a workflow" response a workflow someone disabled by
 *  hand? Anything else — active, disabled by GitHub for inactivity, an error
 *  body, an unreadable response — is NOT a pause, so a stale video pages. */
export function isWorkflowPaused(workflow: unknown): boolean {
  return (
    typeof workflow === "object" &&
    workflow !== null &&
    (workflow as { state?: unknown }).state === "disabled_manually"
  );
}

export function evaluateVideo(args: {
  /** Most recent entry in data/upload-log.json, or null if none. */
  latest: UploadLogEntry | null;
  now: number;
  maxAgeMinutes: number;
  /** Title returned by YouTube oEmbed for `latest.url`, or null if the
   *  oEmbed call failed / the video is not public — i.e. not actually live. */
  oembedTitle: string | null;
  /** The daily-video workflow is disabled by hand on GitHub right now.
   *  Omitted / false when active or when the state could not be read. */
  paused?: boolean;
}): IntegrityReport {
  const nowIso = new Date(args.now).toISOString();

  if (!args.latest) {
    return buildReport({
      source: "daily-video",
      observedAt: nowIso,
      checks: [
        {
          name: "exists",
          ok: false,
          severity: "critical",
          detail: "no upload-log entries",
        },
      ],
    });
  }

  // upload-log dates are YMD; anchor freshness to midnight UTC of that day.
  const observedAt = `${args.latest.date}T00:00:00.000Z`;
  const live =
    typeof args.oembedTitle === "string" && args.oembedTitle.trim() !== "";

  const measured = checkFreshness({
    observedAt,
    now: args.now,
    maxAgeMinutes: args.maxAgeMinutes,
  });
  // Only "old" is excused by a pause; an unparseable date stays critical.
  const freshness =
    args.paused && !measured.ok && measured.severity === "stale"
      ? {
          name: "freshness",
          ok: true,
          severity: "info" as const,
          detail: `paused: the daily-video workflow is disabled on GitHub; last upload ${args.latest.date}`,
        }
      : measured;

  return buildReport({
    source: "daily-video",
    observedAt,
    checks: [
      freshness,
      {
        name: "playable",
        ok: live,
        severity: "critical",
        detail: live
          ? `live on YouTube: ${args.oembedTitle}`
          : "oEmbed returned no title — video not public/live (green job, no upload)",
      },
    ],
  });
}
