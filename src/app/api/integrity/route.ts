/**
 * GET /api/integrity — the nervous system's read endpoint.
 *
 * Runs every integrity probe against gawk's LIVE OUTPUT and returns one
 * board: per-source verdicts + a rolled-up worst verdict. Independent of
 * the jobs that produce the data, so a cron that lies green cannot hide
 * here — this checks what was actually delivered.
 *
 * Probes:
 *   - HTTP outputs (globe-events, feed) via the shared runner.
 *   - Video: reads data/upload-log.json + YouTube oEmbed — the daily-video
 *     job goes green on mp4 existence, so the only honest check is whether
 *     today's video actually resolves on YouTube. While the daily-video
 *     workflow is disabled by hand on GitHub (read live, per request), an
 *     old last upload is reported as paused rather than STALE.
 *   - Digest: freshness of the daily-digest cron-health beacon (post the
 *     CR/LF fix that beacon only advances on a real send, so it is honest).
 *   - Machine summaries: FAIL when the model has failed several calls in a
 *     row (msum:model). A dead model went unseen for a week before this.
 *
 * Always 200 — this is a report, not a gate. The integrity-watch workflow
 * curls it and routes any non-OK verdict to Discord.
 */

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildProbeSpecs, PROBE_ORIGIN } from "@/lib/integrity/specs";
import { inProcessFetcher } from "@/lib/integrity/in-process";
import { runProbes, summarise } from "@/lib/integrity/run";
import {
  evaluateVideo,
  isWorkflowPaused,
  type UploadLogEntry,
} from "@/lib/integrity/video";
import {
  buildReport,
  checkFreshness,
  type IntegrityReport,
} from "@/lib/integrity/checks";
import { readAllCronHealth, CRON_WORKFLOWS } from "@/lib/data/cron-health";
import { evaluateMachineSummaries } from "@/lib/integrity/machine-summaries";
import { machineSummaryConfig } from "@/lib/summaries/run-hn";
import { redisMachineSummaryStore } from "@/lib/summaries/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function origin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim().replace(/\/$/, "");
  return env || PROBE_ORIGIN;
}

const DAILY_VIDEO_WORKFLOW_URL =
  "https://api.github.com/repos/Neelagiri65/aipulse/actions/workflows/daily-video.yml";

/** Has someone disabled the daily-video workflow on GitHub? Any failure to
 *  read the state answers "no", so a stale video still pages. */
async function readVideoPaused(): Promise<boolean> {
  try {
    const token = process.env.GH_TOKEN?.trim();
    const res = await fetch(DAILY_VIDEO_WORKFLOW_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "gawk-integrity (+https://gawk.dev)",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    return isWorkflowPaused(await res.json());
  } catch {
    return false;
  }
}

/** Video probe: is the most recent upload-log entry recent AND live on
 *  YouTube? Daily video → allow up to 2 days before stale. */
async function probeVideo(now: number): Promise<IntegrityReport> {
  let latest: UploadLogEntry | null = null;
  try {
    const raw = await readFile(
      path.join(process.cwd(), "data/upload-log.json"),
      "utf8",
    );
    const log = JSON.parse(raw) as UploadLogEntry[];
    latest = Array.isArray(log) && log.length ? log[log.length - 1] : null;
  } catch {
    latest = null;
  }

  const pausedRead = readVideoPaused();

  let oembedTitle: string | null = null;
  if (latest?.url) {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(latest.url)}&format=json`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) {
        const j = (await res.json()) as { title?: string };
        oembedTitle = j.title ?? null;
      }
    } catch {
      oembedTitle = null;
    }
  }

  return evaluateVideo({
    latest,
    now,
    maxAgeMinutes: 2 * 1440,
    oembedTitle,
    paused: await pausedRead,
  });
}

/** Digest probe: freshness of the daily-digest cron-health beacon. */
async function probeDigest(now: number): Promise<IntegrityReport> {
  const records = await readAllCronHealth();
  const rec = records.find((r) => r.workflow === "daily-digest");
  const budget = CRON_WORKFLOWS["daily-digest"].expectedIntervalMinutes * 2;
  const observedAt = rec?.lastSuccessAt ?? null;
  return buildReport({
    source: "daily-digest",
    observedAt: observedAt ?? new Date(now).toISOString(),
    checks: [checkFreshness({ observedAt, now, maxAgeMinutes: budget })],
  });
}

/** Machine-summary model probe: pages on a run of failed model calls. */
async function probeMachineSummaries(now: number): Promise<IntegrityReport> {
  const enabled = machineSummaryConfig() !== null && redisMachineSummaryStore.available();
  let health: Awaited<ReturnType<typeof redisMachineSummaryStore.readModelHealth>> | "unreadable" = null;
  if (enabled) {
    try {
      health = await redisMachineSummaryStore.readModelHealth();
    } catch {
      health = "unreadable";
    }
  }
  return evaluateMachineSummaries({ enabled, health, now });
}

export async function GET() {
  const now = Date.now();

  const httpReports = await runProbes(
    buildProbeSpecs(origin()),
    inProcessFetcher,
    now,
  );
  const [video, digest, machineSummaries] = await Promise.all([
    probeVideo(now),
    probeDigest(now),
    probeMachineSummaries(now),
  ]);

  const reports = [...httpReports, video, digest, machineSummaries];
  const s = summarise(reports);

  return NextResponse.json({
    verdict: s.verdict,
    counts: s.counts,
    failing: s.failing.map((r) => r.source),
    reports,
    generatedAt: new Date(now).toISOString(),
  });
}
