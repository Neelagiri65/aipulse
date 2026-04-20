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
import type {
  HnItem,
  HnAuthor,
  HnWireItem,
  HnWireResult,
} from "@/lib/data/wire-hn";
import type { GlobePoint } from "@/components/globe/Globe";

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

// ---------------------------------------------------------------------------
// readWire — public assembly path used by GET /api/hn
// ---------------------------------------------------------------------------

const HN_BRAND_ORANGE = "#ff6600";
const HN_ITEM_URL = "https://news.ycombinator.com/item?id=";

/**
 * Assemble the full wire response from Redis in at most 4 commands:
 * 1 ZRANGE + 1 MGET items + 1 MGET authors + 1 GET meta. Returns
 * source:"unavailable" when Redis is not configured; callers should
 * render the grey-card fallback in that case.
 *
 * Points list is the subset with resolved author coordinates — every
 * item always appears in `items` so THE WIRE can render it; only
 * geocoded items make it onto the map. kind-routing uses meta.kind="hn".
 */
export async function readWire(): Promise<HnWireResult> {
  const nowIso = new Date().toISOString();
  const empty: HnWireResult = {
    ok: true,
    items: [],
    points: [],
    polledAt: nowIso,
    coverage: { itemsTotal: 0, itemsWithLocation: 0, geocodeResolutionPct: 0 },
    meta: { lastFetchOkTs: null, staleMinutes: null },
    source: "unavailable",
  };
  if (!isHnStoreAvailable()) return empty;

  const ids = await readWireIds();
  const itemsMap = await readItems(ids);
  const ordered: HnItem[] = [];
  for (const id of ids) {
    const it = itemsMap.get(id);
    if (it) ordered.push(it);
  }
  const usernames = Array.from(new Set(ordered.map((i) => i.author)));
  const authorsMap = await readAuthors(usernames);
  const meta = await readMeta();

  const items: HnWireItem[] = ordered.map((it) => {
    const author = authorsMap.get(it.author);
    const hasCoords =
      author && author.resolveStatus === "ok" && author.lat !== null &&
      author.lng !== null;
    return {
      ...it,
      kind: "hn",
      lat: hasCoords ? author.lat : null,
      lng: hasCoords ? author.lng : null,
      locationLabel: author?.rawLocation ?? null,
    };
  });

  const points: GlobePoint[] = items
    .filter(
      (i): i is HnWireItem & { lat: number; lng: number } =>
        i.lat !== null && i.lng !== null,
    )
    .map((i) => ({
      lat: i.lat,
      lng: i.lng,
      color: HN_BRAND_ORANGE,
      size: 0.35,
      meta: {
        kind: "hn",
        id: i.id,
        title: i.title,
        author: i.author,
        points: i.points,
        numComments: i.numComments,
        createdAt: i.createdAt,
        hnUrl: HN_ITEM_URL + i.id,
        url: i.url,
        locationLabel: i.locationLabel,
      },
    }));

  const itemsTotal = items.length;
  const itemsWithLocation = points.length;
  const geocodeResolutionPct =
    itemsTotal > 0 ? Math.round((itemsWithLocation / itemsTotal) * 100) : 0;

  const lastFetchOkTs = meta?.lastFetchOkTs ?? null;
  const staleMinutes = lastFetchOkTs
    ? Math.max(
        0,
        Math.round(
          (Date.now() - new Date(lastFetchOkTs).getTime()) / 60_000,
        ),
      )
    : null;

  return {
    ok: true,
    items,
    points,
    polledAt: nowIso,
    coverage: { itemsTotal, itemsWithLocation, geocodeResolutionPct },
    meta: { lastFetchOkTs, staleMinutes },
    source: "redis",
  };
}
