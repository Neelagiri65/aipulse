/**
 * Reddit ingest — cron-driven RSS poll for the curated subreddit slate.
 *
 * Mirrors wire-rss in shape (parser-reuse via parseAtom) but keeps a
 * narrower data model: no geographic fields, no per-source map state.
 * Purpose is feed-input-only, not panel rendering.
 *
 * Trust contract:
 *   - Items are posts as Reddit's own RSS publishes them. We do not
 *     re-rank, infer scores, or merge across subs — each card cites the
 *     subreddit verbatim and links to the comments page.
 *   - Per-source failure isolation: one feed throwing does not abort
 *     the batch; a working sub still contributes items.
 *   - Reddit requires a non-default User-Agent (default fetch UA returns
 *     429). We send `gawk.dev-rss-ingest/1.0` so they can attribute the
 *     calls and rate-limit us cleanly.
 */

import { Redis } from "@upstash/redis";
import {
  computeItemId,
  parseAtom,
  type RssRawItem,
} from "@/lib/data/wire-rss";
import {
  REDDIT_SOURCES,
  type RedditSource,
} from "@/lib/data/reddit-sources";

const USER_AGENT = "gawk.dev-rss-ingest/1.0";

/** Stored shape per Reddit item. */
export type RedditItem = {
  id: string;
  sourceId: string;
  /** Subreddit display name e.g. "r/LocalLLaMA". Cached so the deriver
   *  doesn't need to re-join against REDDIT_SOURCES. */
  sourceDisplayName: string;
  title: string;
  /** Reddit comments page URL (Atom <link rel="alternate">). */
  url: string;
  /** Seconds since epoch. ZSET score. */
  publishedTs: number;
  firstSeenTs: string;
  lastRefreshTs: string;
};

export type RedditIngestResult = {
  ok: boolean;
  sources: Array<{
    id: string;
    fetched: number;
    written: number;
    error: string | null;
  }>;
  at: string;
};

/** ZSET of every item id seen, scored by publishedTs. */
const ITEM_INDEX_KEY = "reddit:items:index";
/** Per-item JSON blob. */
function itemKey(id: string): string {
  return `reddit:item:${id}`;
}
/** Per-item TTL — 7 days. Enough for the 6h NEWS window plus archive
 *  margin. The ZSET prune below cleans the index in lockstep. */
const ITEM_TTL_SECONDS = 7 * 24 * 60 * 60;
const RETENTION_WINDOW_SECONDS = 7 * 24 * 60 * 60;

let cached: Redis | null | undefined;

function defaultClient(): Redis | null {
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

export function __resetRedditClientCache(): void {
  cached = undefined;
}

export interface RedditStoreSink {
  writeItem(item: RedditItem): Promise<void>;
  zaddIndex(id: string, score: number): Promise<void>;
  zpruneIndex(cutoffSecs: number): Promise<number>;
}

function defaultSink(): RedditStoreSink | null {
  const r = defaultClient();
  if (!r) return null;
  return {
    async writeItem(item) {
      await r.set(itemKey(item.id), JSON.stringify(item), {
        ex: ITEM_TTL_SECONDS,
      });
    },
    async zaddIndex(id, score) {
      await r.zadd(ITEM_INDEX_KEY, { score, member: id });
    },
    async zpruneIndex(cutoffSecs) {
      // Remove entries older than the retention cutoff; bound the index
      // size so it doesn't grow unbounded on a long-running deploy.
      const dropped = await r.zremrangebyscore(
        ITEM_INDEX_KEY,
        0,
        cutoffSecs - 1,
      );
      return typeof dropped === "number" ? dropped : 0;
    },
  };
}

/**
 * Read the most-recent N items across all subs. Newest first by
 * publishedTs. Returns [] when Redis is absent.
 */
export async function readRecentRedditItems(
  limit: number = 50,
): Promise<RedditItem[]> {
  const r = defaultClient();
  if (!r) return [];
  try {
    const ids = (await r.zrange(ITEM_INDEX_KEY, 0, limit - 1, {
      rev: true,
    })) as string[];
    if (ids.length === 0) return [];
    const keys = ids.map((id) => itemKey(id));
    const blobs = (await r.mget(...keys)) as unknown[];
    const out: RedditItem[] = [];
    for (const blob of blobs) {
      const parsed = parseStoredItem(blob);
      if (parsed) out.push(parsed);
    }
    // mget preserves order; that's already newest-first because of
    // the ZRANGE rev=true above.
    return out;
  } catch {
    return [];
  }
}

function parseStoredItem(value: unknown): RedditItem | null {
  if (!value) return null;
  try {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.id !== "string" ||
      typeof o.sourceId !== "string" ||
      typeof o.title !== "string" ||
      typeof o.url !== "string" ||
      typeof o.publishedTs !== "number"
    ) {
      return null;
    }
    return obj as RedditItem;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — exposed for tests
// ---------------------------------------------------------------------------

/**
 * Project a raw Atom entry into the stored shape. Returns null when any
 * required field is missing or the timestamp is unparseable.
 */
export function normaliseRedditItem(
  raw: RssRawItem,
  source: RedditSource,
  nowIso: string,
): RedditItem | null {
  if (!raw.title || !raw.link) return null;
  const publishedMs = raw.pubDate ? Date.parse(raw.pubDate) : NaN;
  if (!Number.isFinite(publishedMs)) return null;
  // Reject obviously-bogus far-future timestamps (Reddit RSS occasionally
  // ships bad <updated> values from edited posts).
  const nowMs = Date.parse(nowIso);
  if (Number.isFinite(nowMs) && publishedMs > nowMs + 60 * 60 * 1000) {
    return null;
  }
  const key = raw.guid || raw.link;
  const id = computeItemId(source.id, key);
  return {
    id,
    sourceId: source.id,
    sourceDisplayName: source.displayName,
    title: raw.title,
    url: raw.link,
    publishedTs: Math.floor(publishedMs / 1000),
    firstSeenTs: nowIso,
    lastRefreshTs: nowIso,
  };
}

// ---------------------------------------------------------------------------
// Cron-driven fetcher
// ---------------------------------------------------------------------------

async function fetchOne(
  source: RedditSource,
): Promise<{ items: RssRawItem[]; error: string | null }> {
  try {
    const res = await fetch(source.rssUrl, {
      headers: {
        Accept: "application/atom+xml",
        "User-Agent": USER_AGENT,
      },
      // Bypass any default Next caching; the cron is the cache layer.
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        items: [],
        error: `HTTP ${res.status}`,
      };
    }
    const xml = await res.text();
    const items = parseAtom(xml);
    return { items, error: null };
  } catch (e) {
    return {
      items: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Run one ingest pass over every Reddit source. Pure-ish — IO is real
 * but isolated to the sink and fetch. Sources iterate in declaration
 * order; failures don't short-circuit.
 */
export async function runRedditIngest(opts: {
  sink?: RedditStoreSink | null;
  nowIso?: string;
} = {}): Promise<RedditIngestResult> {
  const sink = opts.sink ?? defaultSink();
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const sources: RedditIngestResult["sources"] = [];
  let okOverall = true;

  for (const source of REDDIT_SOURCES) {
    const fetched = await fetchOne(source);
    if (fetched.error) {
      okOverall = false;
      sources.push({
        id: source.id,
        fetched: 0,
        written: 0,
        error: fetched.error,
      });
      continue;
    }
    let written = 0;
    if (sink) {
      for (const raw of fetched.items) {
        const item = normaliseRedditItem(raw, source, nowIso);
        if (!item) continue;
        try {
          await sink.writeItem(item);
          await sink.zaddIndex(item.id, item.publishedTs);
          written += 1;
        } catch {
          // Write failure on a single item shouldn't kill the batch.
        }
      }
    }
    sources.push({
      id: source.id,
      fetched: fetched.items.length,
      written,
      error: null,
    });
  }

  if (sink) {
    try {
      const cutoff =
        Math.floor(Date.parse(nowIso) / 1000) - RETENTION_WINDOW_SECONDS;
      await sink.zpruneIndex(cutoff);
    } catch {
      // Prune failure is non-fatal — items will TTL out individually.
    }
  }

  return { ok: okOverall, sources, at: nowIso };
}
