/**
 * Redis-backed store for processed globe events.
 *
 * Design:
 *   - Events are stored fully-processed (GlobePoint with meta) so the
 *     read path is a cheap LRANGE + JSON parse. All expensive work
 *     (geocoding, AI-config probing) happens at write time in the
 *     ingest endpoint — never on the read path.
 *   - Single LIST keyed by toolId-less namespace. Newest first via
 *     LPUSH. LTRIM caps memory. 4h TTL so stale data auto-evicts.
 *   - Dedupe happens at read time: same event id appearing multiple
 *     times (e.g. archive + api overlap) collapses into the latest.
 *   - Graceful degradation: when Redis is unavailable, writer no-ops
 *     and reader returns empty; the API route falls back to the
 *     legacy in-process poll so the globe is never blank just because
 *     infra is down.
 *
 * Redis command budget (free tier 10k/day):
 *   - Writes per ingest: 3 (LPUSH batch + LTRIM + EXPIRE)
 *   - Reads per API hit: 2 (LRANGE + GET meta)
 *   - Expected daily cost under load: ~4k commands, well within budget.
 */

import { Redis } from "@upstash/redis";
import type { GlobePoint } from "@/components/globe/Globe";

const EVENTS_KEY = "aipulse:globe-events";
const META_KEY = "aipulse:globe-ingest-meta";
const KEY_TTL_SECONDS = 4 * 60 * 60; // 4h — longer than our 120-min display window so window reads never find an expired list.
const MAX_EVENTS = 20000; // generous cap; real volume after dedupe settles ~3–8k.

export type StoredGlobePoint = GlobePoint & {
  /** ISO timestamp of the underlying GitHub event. Used for window filtering. */
  eventAt: string;
  /** GitHub event id — primary dedupe key. */
  eventId: string;
  /** Where this event originated (archive-hour vs live-api). Transparency. */
  sourceKind: "gharchive" | "events-api";
};

export type IngestMeta = {
  /** ISO of the most recent successful ingest (any source). */
  lastIngestAt: string;
  /** Human-readable description of what ran — "events-api" or "gharchive 2026-04-18-15". */
  lastIngestSource: string;
  /** Events received from upstream before any filtering. */
  eventsReceived: number;
  /** Events that survived type-filter + geocode. */
  eventsWithLocation: number;
  /** Coverage % of the most recent ingest. */
  locationCoveragePct: number;
  /** Window size at ingest time (after dedupe + write). */
  windowSize: number;
  /** Events in window with AI-config detected. */
  windowAiConfig: number;
  /** Window horizon in minutes. */
  windowMinutes: number;
  /** Non-fatal failures surfaced for transparency. */
  failures: Array<{ step: string; message: string }>;
};

let cached: Redis | null | undefined;

function redis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return cached;
  }
  cached = new Redis({ url, token });
  return cached;
}

export function isGlobeStoreAvailable(): boolean {
  return redis() !== null;
}

/**
 * Append a batch of processed points to the store. Single LPUSH with all
 * values keeps command count low. LTRIM caps size. EXPIRE refreshes TTL.
 */
export async function writePoints(points: StoredGlobePoint[]): Promise<void> {
  const r = redis();
  if (!r || points.length === 0) return;
  const payloads = points.map((p) => JSON.stringify(p));
  try {
    // lpush accepts variadic values; we spread to push them all in one op.
    await r.lpush(EVENTS_KEY, ...payloads);
    await r.ltrim(EVENTS_KEY, 0, MAX_EVENTS - 1);
    await r.expire(EVENTS_KEY, KEY_TTL_SECONDS);
  } catch {
    // Never let ingest write failures propagate — we'll retry next run.
  }
}

/**
 * Read the full event list, dedupe by eventId (latest wins), and filter
 * to the requested window.
 */
export async function readWindow(
  windowMinutes: number,
): Promise<StoredGlobePoint[]> {
  const r = redis();
  if (!r) return [];
  try {
    const raw = await r.lrange(EVENTS_KEY, 0, MAX_EVENTS - 1);
    const cutoffMs = Date.now() - windowMinutes * 60 * 1000;
    const byId = new Map<string, StoredGlobePoint>();
    for (const entry of raw as unknown[]) {
      const parsed = parseEntry(entry);
      if (!parsed) continue;
      const ts = Date.parse(parsed.eventAt);
      if (Number.isNaN(ts) || ts < cutoffMs) continue;
      // First occurrence wins because LRANGE returns newest-first (LPUSH order).
      if (!byId.has(parsed.eventId)) byId.set(parsed.eventId, parsed);
    }
    return Array.from(byId.values());
  } catch {
    return [];
  }
}

export async function writeMeta(meta: IngestMeta): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(META_KEY, JSON.stringify(meta), { ex: KEY_TTL_SECONDS });
  } catch {
    // no-op
  }
}

export async function readMeta(): Promise<IngestMeta | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(META_KEY);
    if (!v) return null;
    if (typeof v === "string") return JSON.parse(v) as IngestMeta;
    if (typeof v === "object") return v as IngestMeta;
    return null;
  } catch {
    return null;
  }
}

function parseEntry(entry: unknown): StoredGlobePoint | null {
  try {
    const obj = typeof entry === "string" ? JSON.parse(entry) : entry;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.eventId !== "string" ||
      typeof o.eventAt !== "string" ||
      typeof o.lat !== "number" ||
      typeof o.lng !== "number"
    ) {
      return null;
    }
    return obj as StoredGlobePoint;
  } catch {
    return null;
  }
}
