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
// 48h TTL covers two full 24h windows so the regional-deltas route can
// partition into current24h vs prior24h from a single LRANGE. Display
// window stays at WINDOW_MINUTES (240 = 4h) — the extension is read-side
// only, the map dot density doesn't change. MAX_EVENTS is a generous
// cap that comfortably absorbs the 12× retention bump (4h → 48h) at
// observed daily volume after dedupe (3-8k); under the 20k ceiling
// even at the 95th percentile.
const KEY_TTL_SECONDS = 48 * 60 * 60;
const MAX_EVENTS = 20000;

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

// ---------------------------------------------------------------------------
// Regional snapshot store (S56)
// ---------------------------------------------------------------------------

const SNAPSHOT_PREFIX = "aipulse:globe-events:snapshot:";
const SNAPSHOT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Daily aggregation of events written by the globe-events-snapshot cron
 * at 00:05 UTC. Keyed by the date that just ended (YYYY-MM-DD) so the
 * regional-deltas read path can compare current rolling-24h to the
 * snapshot from `today - 1d`.
 *
 * Why a dedicated snapshot key instead of recomputing on-demand from
 * the 48h list: 30-day retention. The list TTL is 48h; if we want to
 * compare to "this time last week" later, only the snapshot survives.
 * Storage cost is negligible (one tiny JSON blob per day, 30-day TTL).
 */
export type RegionalSnapshot = {
  /** YYYY-MM-DD (UTC) — the date this snapshot represents. */
  date: string;
  /** ISO of when the snapshot was written. */
  generatedAt: string;
  /** Total events that contributed to the aggregate. */
  totalEvents: number;
  /** Events with no resolvable country (coord outside every tracked
   *  bbox). Surfaced honestly so consumers can see how much of the
   *  total is uncountable rather than hiding it. */
  unattributedEvents: number;
  /** Per-country counts. Keys are full country display names
   *  ("India", "United States"). */
  byCountry: Record<string, number>;
  /** Per-city counts. Keys are canonical city names from
   *  `cityFromCoords` reverse lookup. */
  byCity: Record<string, number>;
};

export function regionalSnapshotKey(date: string): string {
  return `${SNAPSHOT_PREFIX}${date}`;
}

export async function writeRegionalSnapshot(
  snap: RegionalSnapshot,
): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(regionalSnapshotKey(snap.date), JSON.stringify(snap), {
      ex: SNAPSHOT_TTL_SECONDS,
    });
  } catch {
    // observability must not break the pipeline it observes
  }
}

export async function readRegionalSnapshot(
  date: string,
): Promise<RegionalSnapshot | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(regionalSnapshotKey(date));
    if (!v) return null;
    const obj = typeof v === "string" ? JSON.parse(v) : v;
    if (
      !obj ||
      typeof obj !== "object" ||
      typeof (obj as { date?: unknown }).date !== "string" ||
      typeof (obj as { byCountry?: unknown }).byCountry !== "object"
    ) {
      return null;
    }
    return obj as RegionalSnapshot;
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
