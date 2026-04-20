/**
 * Redis-backed store for regional RSS items, per-source status, and
 * ingest meta. Mirrors `hn-store.ts` shape, disjoint keyspace.
 *
 * Key design:
 *   rss:item:{itemId}         SET, EX 7d
 *   rss:source:{sourceId}     SET, EX 7d
 *   rss:wire                  ZSET, score = publishedTs seconds
 *   rss:meta                  SET, EX 24h
 *
 * Command budget (48 ingest runs/day, 5 feeds):
 *   Per run: 5 × (GET source + fetch + parse + ~10 GET item + ~10 SET item +
 *     ~10 ZADD) + 1 ZREMRANGEBYSCORE + 1 SET meta ≈ 160 cmds.
 *   Daily: ~7.7k/day. Well under Upstash free tier (500k/mo).
 *
 * firstSeenTs preservation happens inside runRssIngest (it reads the
 * existing record before writing), mirroring the HN pattern.
 */

import { Redis } from "@upstash/redis";
import {
  assembleRssWire,
  type RssItem,
  type RssSourceStatus,
  type RssIngestMeta,
  type RssStoreSink,
  type RssWireResult,
} from "@/lib/data/wire-rss";
import { RSS_SOURCES, type RssSource } from "@/lib/data/rss-sources";

const ITEM_KEY_PREFIX = "rss:item:";
const SOURCE_KEY_PREFIX = "rss:source:";
const WIRE_KEY = "rss:wire";
const META_KEY = "rss:meta";

const ITEM_TTL_SECONDS = 7 * 24 * 60 * 60;
const SOURCE_TTL_SECONDS = 7 * 24 * 60 * 60;
const META_TTL_SECONDS = 24 * 60 * 60;

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

export function isRssStoreAvailable(): boolean {
  return redis() !== null;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function writeItem(item: RssItem): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(ITEM_KEY_PREFIX + item.id, JSON.stringify(item), {
      ex: ITEM_TTL_SECONDS,
    });
  } catch {
    // no-op
  }
}

export async function readItem(id: string): Promise<RssItem | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(ITEM_KEY_PREFIX + id);
    return parseItem(v);
  } catch {
    return null;
  }
}

export async function readItems(ids: string[]): Promise<Map<string, RssItem>> {
  const out = new Map<string, RssItem>();
  const r = redis();
  if (!r || ids.length === 0) return out;
  try {
    const keys = ids.map((id) => ITEM_KEY_PREFIX + id);
    const values = (await r.mget(...keys)) as unknown[];
    values.forEach((v, i) => {
      const parsed = parseItem(v);
      if (parsed) out.set(ids[i], parsed);
    });
  } catch {
    // partial
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function writeSource(status: RssSourceStatus): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(SOURCE_KEY_PREFIX + status.id, JSON.stringify(status), {
      ex: SOURCE_TTL_SECONDS,
    });
  } catch {
    // no-op
  }
}

export async function readSources(
  ids: string[],
): Promise<Map<string, RssSourceStatus>> {
  const out = new Map<string, RssSourceStatus>();
  const r = redis();
  if (!r || ids.length === 0) return out;
  try {
    const keys = ids.map((id) => SOURCE_KEY_PREFIX + id);
    const values = (await r.mget(...keys)) as unknown[];
    values.forEach((v, i) => {
      const parsed = parseSource(v);
      if (parsed) out.set(ids[i], parsed);
    });
  } catch {
    // partial
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wire ZSET
// ---------------------------------------------------------------------------

export async function zaddWire(id: string, score: number): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.zadd(WIRE_KEY, { score, member: id });
  } catch {
    // no-op
  }
}

export async function zpruneWire(cutoffSecs: number): Promise<number> {
  const r = redis();
  if (!r) return 0;
  try {
    const removed = await r.zremrangebyscore(WIRE_KEY, 0, cutoffSecs);
    return typeof removed === "number" ? removed : 0;
  } catch {
    return 0;
  }
}

export async function readWireIds(): Promise<string[]> {
  const r = redis();
  if (!r) return [];
  try {
    const ids = (await r.zrange(WIRE_KEY, 0, -1, { rev: true })) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export async function writeMeta(meta: RssIngestMeta): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(META_KEY, JSON.stringify(meta), { ex: META_TTL_SECONDS });
  } catch {
    // no-op
  }
}

export async function readMeta(): Promise<RssIngestMeta | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(META_KEY);
    return parseMeta(v);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parsers (defensive JSON)
// ---------------------------------------------------------------------------

function parseItem(v: unknown): RssItem | null {
  try {
    const obj = typeof v === "string" ? JSON.parse(v) : v;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.id !== "string" ||
      typeof o.sourceId !== "string" ||
      typeof o.title !== "string" ||
      typeof o.url !== "string" ||
      typeof o.publishedTs !== "number" ||
      typeof o.firstSeenTs !== "string" ||
      typeof o.lastRefreshTs !== "string"
    ) {
      return null;
    }
    return obj as RssItem;
  } catch {
    return null;
  }
}

function parseSource(v: unknown): RssSourceStatus | null {
  try {
    const obj = typeof v === "string" ? JSON.parse(v) : v;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.id !== "string") return null;
    return obj as RssSourceStatus;
  } catch {
    return null;
  }
}

function parseMeta(v: unknown): RssIngestMeta | null {
  try {
    const obj = typeof v === "string" ? JSON.parse(v) : v;
    if (!obj || typeof obj !== "object") return null;
    return obj as RssIngestMeta;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// RssStoreSink adapter — injected into runRssIngest
// ---------------------------------------------------------------------------

export const redisRssStore: RssStoreSink = {
  writeItem,
  readItem,
  zaddWire,
  zpruneWire,
  writeSource,
  writeMeta,
};

// ---------------------------------------------------------------------------
// readRssWire — public assembly path used by GET /api/rss
//
// Command budget: exactly 4 Upstash commands per origin hit when the
// store is available (1 ZRANGE + 1 MGET items + 1 MGET source-statuses +
// 1 GET meta). CDN caching in the route halves that under steady load.
//
// Pure panel-shape logic lives in `assembleRssWire` (wire-rss.ts) so
// the shape contract is unit-testable without mocking Upstash. This
// function is the thin Redis glue.
// ---------------------------------------------------------------------------

export async function readRssWire(
  sources: readonly RssSource[] = RSS_SOURCES,
): Promise<RssWireResult> {
  const nowMs = Date.now();
  if (!isRssStoreAvailable()) {
    return assembleRssWire({
      orderedIds: [],
      itemsMap: new Map(),
      statusMap: new Map(),
      meta: null,
      sources,
      nowMs,
      source: "unavailable",
    });
  }

  // 1. ZRANGE (desc by publishedTs; bounded by 7d retention)
  const orderedIds = await readWireIds();
  // 2. MGET items
  const itemsMap = await readItems(orderedIds);
  // 3. MGET source statuses
  const statusMap = await readSources(sources.map((s) => s.id));
  // 4. GET meta
  const meta = await readMeta();

  return assembleRssWire({
    orderedIds,
    itemsMap,
    statusMap,
    meta,
    sources,
    nowMs,
    source: "redis",
  });
}
