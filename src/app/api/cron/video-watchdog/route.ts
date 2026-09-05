/**
 * Cron route — the off-GitHub video watchdog.
 *
 * Checks whether today's video reached `data/upload-log.json` and, if it
 * did not, dispatches `daily-video.yml`. Identical intent to
 * `.github/workflows/video-watchdog.yml`, deliberately on a DIFFERENT
 * scheduler: on 2026-08-27 and again on 2026-08-28, GitHub dropped the
 * scheduled event for `daily-video` and for the Actions watchdog's slots,
 * so the retry that exists for exactly this case never fired. Adding more
 * slots inside the same scheduler does not leave the failure domain;
 * Vercel's cron does.
 *
 * Cadence: two `vercel.json` cron entries (10:00 + 16:00 UTC). Hobby caps
 * a single cron job at once per day with ±59min precision, so two slots
 * means two entries pointed at this one route. The second is a no-op when
 * the first (or the Actions watchdog, or the pipeline itself) already
 * landed today's entry.
 *
 * The upload log is read from the GitHub contents API, NOT from the
 * deployed bundle: `data/upload-log.json` in `process.cwd()` is frozen at
 * deploy time, so a bundle read would answer a question about the last
 * deploy rather than about today's video.
 *
 * Env (Vercel project):
 *   CRON_SECRET             — Vercel sends `Authorization: Bearer` with it.
 *                             Unset ⇒ Vercel sends no header ⇒ 401.
 *   WORKFLOW_DISPATCH_TOKEN — same value as the repo secret of that name;
 *                             fine-grained PAT with actions:write. Also
 *                             used to read the log (authenticated GitHub
 *                             reads avoid the 60/hr shared-IP anon limit).
 *   INGEST_SECRET           — manual/CI invocation, as every ingest route.
 *   DISCORD_DAILY_WEBHOOK_URL — optional; alert-before-retry parity with
 *                             the Actions watchdog. Skipped when unset.
 */

import { NextResponse } from "next/server";

import { withIngest } from "@/app/api/_lib/withIngest";
import {
  decideWatchdog,
  utcDay,
  type UploadLogLike,
  type WatchdogDecision,
} from "@/lib/video/watchdog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REPO = "Neelagiri65/aipulse";
const WORKFLOW_FILE = "daily-video.yml";
const LOG_PATH = "data/upload-log.json";

type WatchdogResult = {
  decision: WatchdogDecision;
  today: string;
  /** Whether the dispatch was ACCEPTED by GitHub. The dispatch API
   *  returns 204 with no run id, so "accepted" is the strongest claim
   *  available here — it is not proof a run started or a video shipped. */
  dispatchAccepted: boolean;
  dispatchError: string | null;
  alerted: boolean;
};

async function fetchUploadLog(token: string | undefined): Promise<
  UploadLogLike[] | null
> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gawk-video-watchdog",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${LOG_PATH}?ref=main`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const parsed = JSON.parse(await res.text()) as unknown;
    return Array.isArray(parsed) ? (parsed as UploadLogLike[]) : null;
  } catch {
    return null;
  }
}

async function dispatchDailyVideo(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "gawk-video-watchdog",
          "Content-Type": "application/json",
        },
        // No `inputs` at all: the workflow's own defaults are already
        // what we want (formats "youtube", force_distribute false), and
        // the REST dispatch endpoint validates every input value as a
        // STRING even for inputs declared `type: boolean` — a JSON
        // `false` here 422s. That failure would only ever appear on a
        // day the video is missing, i.e. the one day this must work.
        // `gh workflow run` avoids it by sending "false" as a string;
        // sending nothing avoids it outright.
        //
        // force_distribute stays off deliberately: the dedup guard is
        // what makes an overlap with the Actions watchdog a wasted
        // runner rather than a duplicate upload.
        body: JSON.stringify({ ref: "main" }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 204) return { ok: true };
    return {
      ok: false,
      error: `dispatch returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Alert before retry, matching the Actions watchdog's contract: a retry
 *  the founder never hears about hides how often the schedule drops. */
async function alertDiscord(text: string): Promise<boolean> {
  const url = process.env.DISCORD_DAILY_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const POST = withIngest<WatchdogResult>({
  workflow: "video-watchdog-vercel",
  acceptCronSecret: true,
  run: async (): Promise<WatchdogResult> => {
    const token = process.env.WORKFLOW_DISPATCH_TOKEN;
    const today = utcDay(Date.now());
    const log = await fetchUploadLog(token);
    const decision = decideWatchdog({ log, today });

    const base = {
      decision,
      today,
      dispatchAccepted: false,
      dispatchError: null,
      alerted: false,
    } satisfies WatchdogResult;

    if (decision.action !== "dispatch") return base;

    if (!token) {
      return {
        ...base,
        dispatchError:
          "WORKFLOW_DISPATCH_TOKEN unset — today's video is missing and this route cannot retry it",
      };
    }

    const alerted = await alertDiscord(
      `⚠️ Vercel watchdog: no video for ${today} (${decision.reason}). Dispatching daily-video — the GitHub schedule was dropped.`,
    );
    const dispatched = await dispatchDailyVideo(token);

    return {
      ...base,
      alerted,
      dispatchAccepted: dispatched.ok,
      dispatchError: dispatched.ok ? null : dispatched.error,
    };
  },
  // ok:false for BOTH an unreadable log and a refused dispatch — either
  // means the watchdog cannot answer "did today's video ship?", which is
  // the only question it exists to answer. A clean "already uploaded" and
  // an accepted retry are the two healthy outcomes.
  toOutcome: (r) => {
    if (r.decision.action === "error") {
      return { ok: false, error: r.decision.reason };
    }
    if (r.decision.action === "dispatch" && !r.dispatchAccepted) {
      return {
        ok: false,
        error: r.dispatchError ?? "dispatch not accepted by GitHub",
      };
    }
    return { ok: true, itemsProcessed: r.decision.action === "dispatch" ? 1 : 0 };
  },
  toResponse: (r) =>
    NextResponse.json({
      ok:
        r.decision.action === "none" ||
        (r.decision.action === "dispatch" && r.dispatchAccepted),
      action: r.decision.action,
      today: r.today,
      reason: r.decision.reason,
      latestDate: r.decision.latestDate,
      dispatchAccepted: r.dispatchAccepted,
      dispatchError: r.dispatchError,
      alerted: r.alerted,
    }),
});

export const GET = POST;
