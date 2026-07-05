/**
 * Distribution planner for the daily-video pipeline — pure decision
 * logic, extracted so the 2026-07-05 incident class is pinned by tests.
 *
 * THE INCIDENT: a local pipeline run at 02:34Z uploaded the day's video
 * to YouTube (creds present locally) while Discord/Facebook silently
 * skipped (webhook env absent locally). The dirty upload-log.json was
 * then swept into an unrelated PR, so the scheduled 09:44Z CI run hit
 * the all-or-nothing "already uploaded today" guard and skipped
 * DISTRIBUTION ENTIRELY — the video existed but no announcement ever
 * went out, and every signal stayed green.
 *
 * Two structural fixes, both decided here:
 *  1. LOCAL GUARD — distribution is CI-only by default. A local run
 *     must pass --allow-local-distribute to upload anywhere; iterating
 *     locally can never again mint a half-distributed day.
 *  2. PER-PLATFORM HEALING — the dedup guard compares per platform, so
 *     a day whose upload happened without its announcements re-runs
 *     ONLY the missing platforms. Legacy log entries (no `platforms`
 *     field) recorded only the YouTube upload, so they count as
 *     youtube-done and everything else heals.
 */

export type UploadLogEntryLike = {
  date: string;
  /** Platforms that completed for this date. Absent on legacy entries
   *  (which were written by the YouTube uploader alone). */
  platforms?: string[];
};

export type DistributionPlan =
  | { kind: "skip"; reason: "no-distribute" | "local-guard" | "all-done" }
  | { kind: "run"; platforms: string[]; reason: "fresh" | "forced" | "heal" };

export function planDistribution(opts: {
  requested: string[];
  todayEntry: UploadLogEntryLike | null;
  forceDistribute: boolean;
  noDistribute: boolean;
  isCi: boolean;
  allowLocalDistribute: boolean;
}): DistributionPlan {
  if (opts.noDistribute) return { kind: "skip", reason: "no-distribute" };
  if (!opts.isCi && !opts.allowLocalDistribute) {
    return { kind: "skip", reason: "local-guard" };
  }
  if (opts.forceDistribute) {
    return { kind: "run", platforms: opts.requested, reason: "forced" };
  }
  if (!opts.todayEntry) {
    return { kind: "run", platforms: opts.requested, reason: "fresh" };
  }
  const done = new Set(opts.todayEntry.platforms ?? ["youtube"]);
  const missing = opts.requested.filter((p) => !done.has(p));
  if (missing.length === 0) return { kind: "skip", reason: "all-done" };
  return { kind: "run", platforms: missing, reason: "heal" };
}
