/**
 * Daily snapshot archival — captures the observable state of AI Pulse
 * once per UTC day so trend charts have a past to draw from.
 *
 * Design:
 *   - One JSON blob per day, keyed `snapshot:{YYYY-MM-DD}`. No TTL —
 *     the whole point is that old snapshots remain readable for trend
 *     lines. Free-tier Upstash at one ~2 KB key per day is ~730 KB per
 *     year of history; trivial.
 *   - `snapshot:index` is a Redis ZSET mapping each captured date
 *     (member) to its epoch-ms score. Reads of "last N days" become a
 *     single ZREVRANGE + MGET instead of SCAN gymnastics.
 *   - Collection is deliberately narrow: only metrics the dashboard
 *     already publishes. No new pipelines, no new upstream calls, no
 *     synthesis. If a field is unknown (registry empty, tools fetch
 *     errored) we write null and move on — an honest gap is better
 *     than a fabricated zero.
 *   - Snapshot building is non-throwing. Individual collectors catch
 *     their own errors and surface them in the `failures[]` block, so a
 *     single upstream blip never drops the whole day's record.
 */

import { Redis } from "@upstash/redis";
import {
  ALL_SOURCES,
  VERIFIED_SOURCES,
  PENDING_SOURCES,
} from "@/lib/data-sources";
import { readAllEntries } from "@/lib/data/repo-registry";
import { readWindow, readMeta as readGlobeMeta } from "@/lib/data/globe-store";
import { fetchAllStatus } from "@/lib/data/fetch-status";
import type { BenchmarksPayload } from "@/lib/data/benchmarks-lmarena";
import type { RegistryEntry } from "@/lib/data/registry-shared";
import benchmarksPayload from "../../../data/benchmarks/lmarena-latest.json";

const KEY_PREFIX = "snapshot:";
const INDEX_KEY = "snapshot:index";

export type SnapshotSources = {
  total: number;
  verified: number;
  pending: number;
};

export type SnapshotRegistry = {
  total: number;
  withLocation: number;
  geocodeRate: number; // 0..1, share of registry entries with a location
  byConfigKind: Record<string, number>;
};

export type SnapshotEvents24h = {
  /** Deduped events in the last 24h window that passed geocode. */
  windowSize: number;
  /** Subset of windowSize with a verified AI-config. */
  withAiConfig: number;
  /** Share (0..1) of windowSize that carried AI config. */
  aiConfigShare: number;
};

export type SnapshotTool = {
  id: string;
  status: string;
  activeIncidents: number;
};

export type SnapshotBenchmark = {
  rank: number;
  modelName: string;
  organization: string;
  rating: number;
};

export type SnapshotBenchmarks = {
  publishDate: string | null;
  top3: SnapshotBenchmark[];
};

export type DailySnapshot = {
  /** YYYY-MM-DD in UTC. Also the key suffix and ZSET member. */
  date: string;
  /** ISO of the moment the snapshot was captured. */
  capturedAt: string;
  sources: SnapshotSources;
  registry: SnapshotRegistry | null;
  events24h: SnapshotEvents24h | null;
  tools: SnapshotTool[];
  benchmarks: SnapshotBenchmarks | null;
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

export function isSnapshotStoreAvailable(): boolean {
  return redis() !== null;
}

/** YYYY-MM-DD for the UTC day that contains `now`. */
export function ymdUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function snapshotKey(ymd: string): string {
  return `${KEY_PREFIX}${ymd}`;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export function summariseSources(): SnapshotSources {
  return {
    total: ALL_SOURCES.length,
    verified: VERIFIED_SOURCES.length,
    pending: PENDING_SOURCES.length,
  };
}

export function summariseRegistry(
  entries: readonly RegistryEntry[],
): SnapshotRegistry {
  const total = entries.length;
  let withLocation = 0;
  const byConfigKind: Record<string, number> = {};
  for (const e of entries) {
    if (e.location) withLocation += 1;
    for (const c of e.configs) {
      byConfigKind[c.kind] = (byConfigKind[c.kind] ?? 0) + 1;
    }
  }
  return {
    total,
    withLocation,
    geocodeRate: total > 0 ? withLocation / total : 0,
    byConfigKind,
  };
}

/** Extract the aiConfigShare from an array of 24h globe points. */
export function summariseEvents24h(
  points: ReadonlyArray<{ meta?: Record<string, unknown> }>,
): SnapshotEvents24h {
  const windowSize = points.length;
  let withAiConfig = 0;
  for (const p of points) {
    if (p.meta && p.meta.hasAiConfig === true) withAiConfig += 1;
  }
  return {
    windowSize,
    withAiConfig,
    aiConfigShare: windowSize > 0 ? withAiConfig / windowSize : 0,
  };
}

/**
 * Build the day's snapshot by polling each collector. A failing collector
 * doesn't take down the rest — its output becomes null and the error is
 * captured in the failures[] block.
 */
export async function buildDailySnapshot(
  date: string = ymdUtc(),
  now: Date = new Date(),
): Promise<DailySnapshot> {
  const failures: DailySnapshot["failures"] = [];

  const sources = summariseSources();

  let registry: SnapshotRegistry | null = null;
  try {
    const entries = await readAllEntries();
    registry = summariseRegistry(entries);
  } catch (e) {
    failures.push({
      step: "registry",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  let events24h: SnapshotEvents24h | null = null;
  try {
    const window = await readWindow(24 * 60);
    // If the window is empty but the globe-store is configured, fall
    // back to the ingest meta so a quiet 24h doesn't read as "no data".
    if (window.length === 0) {
      const meta = await readGlobeMeta();
      if (meta) {
        events24h = {
          windowSize: meta.windowSize,
          withAiConfig: meta.windowAiConfig,
          aiConfigShare:
            meta.windowSize > 0 ? meta.windowAiConfig / meta.windowSize : 0,
        };
      } else {
        events24h = { windowSize: 0, withAiConfig: 0, aiConfigShare: 0 };
      }
    } else {
      events24h = summariseEvents24h(window);
    }
  } catch (e) {
    failures.push({
      step: "events24h",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const tools: SnapshotTool[] = [];
  try {
    const status = await fetchAllStatus();
    for (const [id, data] of Object.entries(status.data)) {
      if (!data) continue;
      tools.push({
        id,
        status: data.status,
        activeIncidents: data.activeIncidents?.length ?? 0,
      });
    }
  } catch (e) {
    failures.push({
      step: "tools",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  let benchmarks: SnapshotBenchmarks | null = null;
  try {
    const payload = benchmarksPayload as BenchmarksPayload;
    if (payload.ok) {
      benchmarks = {
        publishDate: payload.meta.leaderboardPublishDate,
        top3: payload.rows.slice(0, 3).map((r) => ({
          rank: r.rank,
          modelName: r.modelName,
          organization: r.organization,
          rating: Math.round(r.rating),
        })),
      };
    } else {
      benchmarks = { publishDate: null, top3: [] };
    }
  } catch (e) {
    failures.push({
      step: "benchmarks",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return {
    date,
    capturedAt: now.toISOString(),
    sources,
    registry,
    events24h,
    tools,
    benchmarks,
    failures,
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Write a snapshot blob + index entry. No TTL by design. */
export async function writeSnapshot(snapshot: DailySnapshot): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    const score = Date.parse(`${snapshot.date}T00:00:00Z`);
    await r.set(snapshotKey(snapshot.date), JSON.stringify(snapshot));
    if (!Number.isNaN(score)) {
      await r.zadd(INDEX_KEY, { score, member: snapshot.date });
    }
  } catch {
    // Observability must not break the pipeline it observes. Callers
    // only care that we tried; ingestion still succeeded.
  }
}

export async function readSnapshot(
  date: string,
): Promise<DailySnapshot | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(snapshotKey(date));
    return parseSnapshot(v);
  } catch {
    return null;
  }
}

/**
 * Return the most recent `limit` snapshots, newest first. Uses the
 * ZSET index to avoid SCAN-over-all-keys. Absent or malformed blobs
 * are skipped, not faked.
 */
export async function readRecentSnapshots(
  limit: number,
): Promise<DailySnapshot[]> {
  const r = redis();
  if (!r) return [];
  const clamped = Math.max(1, Math.min(limit, 365));
  try {
    const dates = (await r.zrange(INDEX_KEY, 0, clamped - 1, {
      rev: true,
    })) as string[];
    if (dates.length === 0) return [];
    const keys = dates.map((d) => snapshotKey(d));
    const values = (await r.mget(...keys)) as unknown[];
    const result: DailySnapshot[] = [];
    for (const v of values) {
      const parsed = parseSnapshot(v);
      if (parsed) result.push(parsed);
    }
    return result;
  } catch {
    return [];
  }
}

function parseSnapshot(value: unknown): DailySnapshot | null {
  if (!value) return null;
  try {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.date !== "string" || typeof o.capturedAt !== "string") {
      return null;
    }
    return obj as DailySnapshot;
  } catch {
    return null;
  }
}
