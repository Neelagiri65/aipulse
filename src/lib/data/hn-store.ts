/**
 * Redis-backed store for HN stories, author locations, and ingest meta.
 *
 * Key design:
 *   hn:item:{objectID}     SET, EX 86400 (24h)
 *   hn:author:{username}   SET, EX 604800 (7d)
 *   hn:wire                ZSET, score = created_at_i, member = objectID
 *   hn:meta                SET (JSON), EX 86400
 *
 * Command budget (free tier 500k/mo):
 *   - Ingest (every 15min, cap 20 items):
 *       20 × (GET item + SET item) + 20 × (GET author + SET author new only)
 *       + 1 ZADD batch + 1 ZREMRANGEBYSCORE + 1 SET meta
 *       ≈ 45 commands per poll, 96 polls/day = ~4.3k/day
 *   - Read (CDN-absorbed, origin hits rare):
 *       1 ZRANGE + 1 MGET items + 1 MGET authors + 1 GET meta = 4 commands
 *       per origin hit, typically <100/day → negligible
 *
 * Total: well under free-tier ceiling even at steady state.
 *
 * firstSeenTs preservation: writeItem reads the existing record first
 * and keeps its firstSeenTs if present. A climbing-points story (12 →
 * 500 points) keeps its original sighting time across polls.
 */

import { Redis } from "@upstash/redis";
import type { HnItem, HnAuthor } from "@/lib/data/wire-hn";

const ITEM_KEY_PREFIX = "hn:item:";
const AUTHOR_KEY_PREFIX = "hn:author:";
const WIRE_KEY = "hn:wire";
const META_KEY = "hn:meta";

const ITEM_TTL_SECONDS = 24 * 60 * 60;
const AUTHOR_TTL_SECONDS = 7 * 24 * 60 * 60;
const META_TTL_SECONDS = 24 * 60 * 60;

export type HnIngestMeta = {
  lastFetchOkTs: string | null;
  lastFetchAttemptTs: string;
  lastError: string | null;
  itemsSeenTotal: number;
  lastFilterPassCount: number;
  geocodeResolutionPct: number;
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

export function isHnStoreAvailable(): boolean {
  return redis() !== null;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function writeItem(item: HnItem): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    const existing = await readItem(item.id);
    const firstSeenTs = existing?.firstSeenTs ?? item.firstSeenTs;
    const merged: HnItem = { ...item, firstSeenTs };
    await r.set(ITEM_KEY_PREFIX + item.id, JSON.stringify(merged), {
      ex: ITEM_TTL_SECONDS,
    });
  } catch {
    // ingest-side write failures are non-fatal
  }
}

export async function readItem(id: string): Promise<HnItem | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(ITEM_KEY_PREFIX + id);
    return parseHnItem(v);
  } catch {
    return null;
  }
}

export async function readItems(ids: string[]): Promise<Map<string, HnItem>> {
  const out = new Map<string, HnItem>();
  const r = redis();
  if (!r || ids.length === 0) return out;
  try {
    const keys = ids.map((id) => ITEM_KEY_PREFIX + id);
    const values = (await r.mget(...keys)) as unknown[];
    values.forEach((v, i) => {
      const parsed = parseHnItem(v);
      if (parsed) out.set(ids[i], parsed);
    });
  } catch {
    // return whatever we already assembled; empty map is a safe default
  }
  return out;
}

export async function deleteItem(id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.del(ITEM_KEY_PREFIX + id);
  } catch {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

export async function writeAuthor(author: HnAuthor): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(
      AUTHOR_KEY_PREFIX + author.username,
      JSON.stringify(author),
      { ex: AUTHOR_TTL_SECONDS },
    );
  } catch {
    // no-op
  }
}

export async function readAuthor(username: string): Promise<HnAuthor | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(AUTHOR_KEY_PREFIX + username);
    return parseHnAuthor(v);
  } catch {
    return null;
  }
}

export async function readAuthors(
  usernames: string[],
): Promise<Map<string, HnAuthor>> {
  const out = new Map<string, HnAuthor>();
  const r = redis();
  if (!r || usernames.length === 0) return out;
  try {
    const keys = usernames.map((u) => AUTHOR_KEY_PREFIX + u);
    const values = (await r.mget(...keys)) as unknown[];
    values.forEach((v, i) => {
      const parsed = parseHnAuthor(v);
      if (parsed) out.set(usernames[i], parsed);
    });
  } catch {
    // return partial
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wire ZSET
// ---------------------------------------------------------------------------

/** Add or update one member's score (idempotent). */
export async function zaddWire(id: string, score: number): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.zadd(WIRE_KEY, { score, member: id });
  } catch {
    // no-op
  }
}

/** Remove one member from the wire set. */
export async function zremWire(id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.zrem(WIRE_KEY, id);
  } catch {
    // no-op
  }
}

/** Prune members whose score (created_at_i seconds) is older than cutoff. */
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

/** Return all ids in the wire set, newest (highest score) first. */
export async function readWireIds(): Promise<string[]> {
  const r = redis();
  if (!r) return [];
  try {
    // zrange with rev:true returns high-score first.
    const ids = (await r.zrange(WIRE_KEY, 0, -1, { rev: true })) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export async function writeMeta(meta: HnIngestMeta): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(META_KEY, JSON.stringify(meta), { ex: META_TTL_SECONDS });
  } catch {
    // no-op
  }
}

export async function readMeta(): Promise<HnIngestMeta | null> {
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
// Parsers
// ---------------------------------------------------------------------------

function parseHnItem(v: unknown): HnItem | null {
  try {
    const obj = typeof v === "string" ? JSON.parse(v) : v;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.id !== "string" ||
      typeof o.title !== "string" ||
      typeof o.author !== "string" ||
      typeof o.points !== "number" ||
      typeof o.numComments !== "number" ||
      typeof o.createdAtI !== "number" ||
      typeof o.firstSeenTs !== "string" ||
      typeof o.lastRefreshTs !== "string"
    ) {
      return null;
    }
    return obj as HnItem;
  } catch {
    return null;
  }
}

function parseHnAuthor(v: unknown): HnAuthor | null {
  try {
    const obj = typeof v === "string" ? JSON.parse(v) : v;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.username !== "string" ||
      typeof o.resolvedAtTs !== "string" ||
      typeof o.resolveStatus !== "string"
    ) {
      return null;
    }
    return obj as HnAuthor;
  } catch {
    return null;
  }
}

function parseMeta(v: unknown): HnIngestMeta | null {
  try {
    const obj = typeof v === "string" ? JSON.parse(v) : v;
    if (!obj || typeof obj !== "object") return null;
    return obj as HnIngestMeta;
  } catch {
    return null;
  }
}
