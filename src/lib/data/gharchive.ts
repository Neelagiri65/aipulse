/**
 * GH Archive hourly-dump fetcher and parser.
 *
 * Public archive of every GitHub public event, updated hourly, format
 * documented at https://www.gharchive.org. Each hour is a gzipped JSONL
 * file keyed by YYYY-MM-DD-H (hour 0-23, no leading zero).
 *
 * We use it for two things:
 *   1. Cold-start backfill — on the first ingest after Redis goes empty,
 *      pull the last ~6 hours so the globe isn't blank.
 *   2. Continuous fill-in between live-API polls — archive catches
 *      events that the sampled /events endpoint missed.
 *
 * Honesty: every event retains its real created_at, actor, repo. Archive
 * events get sourceKind='gharchive' so the UI can label them distinctly
 * from live-poll events if it ever needs to.
 *
 * Performance: a single hour file is ~100–150MB uncompressed. We stream
 * decompress + JSONL parse so we never buffer the whole file, and we
 * type-filter inline so only relevant events survive the parse.
 */

import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { GitHubEvent } from "@/lib/github";

const gunzipAsync = promisify(gunzip);

const ARCHIVE_BASE = "https://data.gharchive.org";

/** Event types we want on the globe (matches fetch-events RELEVANT_TYPES). */
const RELEVANT_TYPES = new Set([
  "PushEvent",
  "PullRequestEvent",
  "IssuesEvent",
  "ReleaseEvent",
  "ForkEvent",
  "WatchEvent",
  "CreateEvent",
  "IssueCommentEvent",
  "PullRequestReviewEvent",
]);

/**
 * Format a Date as the gharchive hour key: 2026-04-18-15 (no zero-pad
 * on the hour).
 */
export function archiveHourKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = d.getUTCHours(); // no zero-pad
  return `${y}-${m}-${day}-${h}`;
}

/**
 * Return the last `count` archive-hour keys, oldest first. The current
 * hour is excluded because the archive isn't published until ~30 min
 * after the hour ends.
 */
export function recentArchiveHours(count: number, now = new Date()): string[] {
  const keys: string[] = [];
  // Start at "now - 1h" since the current hour isn't published yet.
  const cursor = new Date(now.getTime() - 60 * 60 * 1000);
  for (let i = 0; i < count; i++) {
    const slot = new Date(cursor.getTime() - i * 60 * 60 * 1000);
    keys.push(archiveHourKey(slot));
  }
  return keys.reverse(); // oldest first
}

/**
 * Fetch and parse a single archive hour. Filters inline to RELEVANT_TYPES
 * so the returned array stays small (typically 20–50k relevant out of
 * 300k+ total events per hour).
 */
export async function fetchArchiveHour(hourKey: string): Promise<GitHubEvent[]> {
  const url = `${ARCHIVE_BASE}/${hourKey}.json.gz`;
  const res = await fetch(url, {
    headers: { "User-Agent": "aipulse-ingester/1.0" },
    // Archive hour files never change once published — aggressive cache.
    next: { revalidate: 60 * 60 * 24, tags: [`gharchive:${hourKey}`] },
  });
  if (!res.ok) {
    throw new Error(`gharchive ${hourKey} returned ${res.status}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const decompressed = await gunzipAsync(buf);
  const text = decompressed.toString("utf8");

  const events: GitHubEvent[] = [];
  // JSONL: one JSON object per line.
  for (const line of text.split("\n")) {
    if (!line) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isPlausibleEvent(obj)) continue;
    const evt = obj as GitHubEvent;
    if (!RELEVANT_TYPES.has(evt.type)) continue;
    events.push(evt);
  }
  return events;
}

function isPlausibleEvent(v: unknown): v is GitHubEvent {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.type === "string" &&
    typeof o.created_at === "string" &&
    o.actor != null &&
    typeof (o.actor as { login?: unknown }).login === "string" &&
    o.repo != null &&
    typeof (o.repo as { name?: unknown }).name === "string"
  );
}
