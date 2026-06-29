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
 *     today's video actually resolves on YouTube.
 *   - Digest: freshness of the daily-digest cron-health beacon (post the
 *     CR/LF fix that beacon only advances on a real send, so it is honest).
 *
 * Always 200 — this is a report, not a gate. The integrity-watch workflow
 * curls it and routes any non-OK verdict to Discord.
 */

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildProbeSpecs, PROBE_ORIGIN } from "@/lib/integrity/specs";
import { runProbes, summarise, type Fetcher } from "@/lib/integrity/run";
import { evaluateVideo, type UploadLogEntry } from "@/lib/integrity/video";
import {
  buildReport,
  checkFreshness,
  type IntegrityReport,
} from "@/lib/integrity/checks";
import { readAllCronHealth, CRON_WORKFLOWS } from "@/lib/data/cron-health";
import { fetchGlobeEvents } from "@/lib/data/fetch-events";
import { loadFeedResponse } from "@/lib/feed/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function origin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim().replace(/\/$/, "");
  return env || PROBE_ORIGIN;
}

/**
 * In-process "fetcher": resolves each probe spec's URL to the SAME data
 * accessor its route uses, instead of an HTTP round-trip back into this
 * deployment. Self-referential HTTP cold-start-amplified (the function
 * fetching its own /api/feed + /api/globe-events timed the watchdog out);
 * calling the accessors directly is faster and can't deadlock on itself.
 * Unknown URLs throw, which the runner turns into a critical report.
 */
const inProcessFetcher: Fetcher = async (url) => {
  if (url.endsWith("/api/globe-events")) return fetchGlobeEvents();
  if (url.endsWith("/api/feed")) return loadFeedResponse(Date.now());
  throw new Error(`no in-process source for ${url}`);
};

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

  return evaluateVideo({ latest, now, maxAgeMinutes: 2 * 1440, oembedTitle });
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

export async function GET() {
  const now = Date.now();

  const httpReports = await runProbes(
    buildProbeSpecs(origin()),
    inProcessFetcher,
    now,
  );
  const [video, digest] = await Promise.all([
    probeVideo(now),
    probeDigest(now),
  ]);

  const reports = [...httpReports, video, digest];
  const s = summarise(reports);

  return NextResponse.json({
    verdict: s.verdict,
    counts: s.counts,
    failing: s.failing.map((r) => r.source),
    reports,
    generatedAt: new Date(now).toISOString(),
  });
}
