/**
 * Integrity layer — the video output probe (pure).
 *
 * The daily-video job goes green on mp4 existence, NOT on upload success,
 * so it can publish nothing and still report success. The only honest
 * check is against the OUTPUT itself: the most recent upload-log entry
 * must be recent AND the video must actually resolve on YouTube. The route
 * performs the I/O (read upload-log, call oEmbed) and passes the results
 * here; this function stays pure and testable.
 */

import { buildReport, checkFreshness, type IntegrityReport } from "./checks";

export type UploadLogEntry = {
  date: string;
  url: string;
  visibility?: string;
};

export function evaluateVideo(args: {
  /** Most recent entry in data/upload-log.json, or null if none. */
  latest: UploadLogEntry | null;
  now: number;
  maxAgeMinutes: number;
  /** Title returned by YouTube oEmbed for `latest.url`, or null if the
   *  oEmbed call failed / the video is not public — i.e. not actually live. */
  oembedTitle: string | null;
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

  return buildReport({
    source: "daily-video",
    observedAt,
    checks: [
      checkFreshness({
        observedAt,
        now: args.now,
        maxAgeMinutes: args.maxAgeMinutes,
      }),
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
