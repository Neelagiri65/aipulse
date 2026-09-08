/**
 * Video watchdog — the pure decision (no I/O).
 *
 * Why this exists at all: `.github/workflows/video-watchdog.yml` shares a
 * scheduler with the thing it watches. On 2026-08-27 and 2026-08-28 GitHub
 * dropped the scheduled event for `daily-video` AND for the watchdog — both
 * of the watchdog's slots, on the second day. N slots on one scheduler is
 * still one failure domain, so this decision is driven from a Vercel cron
 * instead: a different scheduler entirely. The Actions watchdog stays; the
 * point is redundancy across providers, not replacement.
 *
 * The route performs the I/O (fetch the upload log from GitHub, POST the
 * workflow dispatch) and passes the result here. This function stays pure
 * and testable, mirroring `evaluateVideo` in `@/lib/integrity/video`.
 *
 * Double-dispatch with the Actions watchdog is harmless: `daily-video`
 * declares `concurrency: daily-video, cancel-in-progress: false` and the
 * pipeline's dedup guard refuses to re-upload a date already in the log
 * unless `force_distribute` is set. So the cost of an overlap is a wasted
 * runner, never a duplicate video.
 */

export type UploadLogLike = { date?: unknown };

export type WatchdogDecision =
  | { action: "none"; reason: string; latestDate: string | null }
  | { action: "dispatch"; reason: string; latestDate: string | null }
  | { action: "error"; reason: string; latestDate: null };

/** UTC calendar day (YYYY-MM-DD) — upload-log dates are UTC YMD. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function decideWatchdog(args: {
  /** Parsed upload log, or null when the fetch/parse failed. */
  log: UploadLogLike[] | null;
  /** UTC day to look for, as YYYY-MM-DD. */
  today: string;
}): WatchdogDecision {
  const { log, today } = args;

  // A failed fetch is NOT a licence to dispatch. "I could not read the
  // log" and "the video is missing" are different findings, and only one
  // of them is fixed by running the pipeline. Blind-dispatching here
  // would also mask a broken token as a healthy retry.
  if (log === null) {
    return {
      action: "error",
      reason: "upload log unavailable — could not fetch or parse",
      latestDate: null,
    };
  }
  if (!Array.isArray(log)) {
    return {
      action: "error",
      reason: "upload log is not an array",
      latestDate: null,
    };
  }

  const dates = log
    .map((e) => (typeof e?.date === "string" ? e.date : null))
    .filter((d): d is string => d !== null);

  // Entries are appended in order, but don't rely on that for the latest.
  const latestDate = dates.length ? dates.slice().sort().at(-1)! : null;

  if (dates.includes(today)) {
    return {
      action: "none",
      reason: `upload log already carries ${today}`,
      latestDate,
    };
  }

  return {
    action: "dispatch",
    reason: latestDate
      ? `no entry for ${today} — latest is ${latestDate}`
      : `no entry for ${today} — upload log is empty`,
    latestDate,
  };
}
