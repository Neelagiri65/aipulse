/**
 * Regional RSS ingest — pure-logic layer.
 *
 * Mirrors `wire-hn.ts` in shape: parsers, deterministic keyword filter,
 * per-feed orchestration, store interface injected for testability.
 *
 * Trust contract (matches CLAUDE.md non-negotiables):
 *   - Parsing is a hand-rolled tag extractor. Failure to parse a feed
 *     yields an empty array plus a failure record — never a thrown
 *     error that aborts the batch.
 *   - AI relevance (for ai-only feeds) is deterministic keyword match
 *     across English + German allowlists. No LLM.
 *   - Timestamps parsed with Date.parse (RFC 822 for RSS 2.0 / RFC 3339
 *     for Atom are both supported by V8's native parser).
 *   - Per-source failure isolation: one feed throwing does not abort
 *     the batch.
 */

import { createHash } from "node:crypto";
import type { RssSource } from "@/lib/data/rss-sources";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw item extracted from a feed, pre-normalisation. */
export type RssRawItem = {
  title: string;
  link: string;
  pubDate: string;
  guid: string;
  description: string;
};

/** Stored item shape written to Redis. */
export type RssItem = {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  /** Seconds since epoch. Used as ZSET score. */
  publishedTs: number;
  /** ISO timestamp the ingest first saw this item. */
  firstSeenTs: string;
  /** ISO timestamp of last ingest pass that touched this item. */
  lastRefreshTs: string;
  description: string;
};

/** Per-source status recorded at the end of each ingest pass. */
export type RssSourceStatus = {
  id: string;
  lastFetchOkTs: string | null;
  lastFetchAttemptTs: string;
  lastError: string | null;
  itemsSeenTotal: number;
  itemsWritten24h: number;
};

/** Aggregate meta recorded at the end of a full ingest pass. */
export type RssIngestMeta = {
  lastFetchOkTs: string | null;
  lastFetchAttemptTs: string;
  lastError: string | null;
  sourcesOk: number;
  sourcesFailed: number;
};

/** Result returned to the ingest API / caller. */
export type RssIngestResult = {
  ok: boolean;
  sources: Array<{
    id: string;
    fetched: number;
    filtered: number;
    written: number;
    error: string | null;
  }>;
  at: string;
};

// ---------------------------------------------------------------------------
// Public (read) shapes — consumed by /api/rss and the UI panels
// ---------------------------------------------------------------------------

/**
 * Wire-ready RSS item: the stored item joined with publisher
 * registry fields (display name + HQ coords) so downstream
 * renderers don't need to re-join against RSS_SOURCES.
 */
export type RssWireItem = RssItem & {
  kind: "rss";
  sourceDisplayName: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  lang: string;
};

/** Aggregated per-source status exposed to the panel + map. */
export type RssSourcePanel = {
  id: string;
  displayName: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  lang: string;
  hqSourceUrl: string;
  /** Publisher's own website root — click target for the publisher name. */
  publisherUrl: string;
  /** The actual RSS/Atom feed URL the ingest polls. Exposed so the UI can cite the feed as the primary source. */
  rssUrl: string;
  feedFormat: "rss" | "atom";
  keywordFilterScope: "all" | "ai-only";
  caveat?: string;
  /** Count of items with publishedTs in the last 24h. */
  itemsLast24h: number;
  /** Count of items with publishedTs in the last 7d (the retention window). */
  itemsLast7d: number;
  /** Last 7 items for this source, most recent first. Feeds SourceCard. */
  recentItems: RssWireItem[];
  lastFetchOkTs: string | null;
  lastError: string | null;
  /** Hours since lastFetchOkTs; null when we have never succeeded. */
  staleHours: number | null;
  /** staleHours > 24 or lastFetchOkTs is null. */
  stale: boolean;
};

export type RssWireResult = {
  ok: boolean;
  sources: RssSourcePanel[];
  items: RssWireItem[];
  polledAt: string;
  meta: {
    lastFetchOkTs: string | null;
    staleMinutes: number | null;
  };
  source: "redis" | "unavailable";
};

// ---------------------------------------------------------------------------
// Pure assembly — separated from Redis I/O so the panel-shape logic is
// unit-testable without mocking Upstash.
// ---------------------------------------------------------------------------

export const RSS_RECENT_ITEMS_PER_SOURCE = 7;
export const RSS_STALE_HOURS_THRESHOLD = 24;

function hoursSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (nowMs - t) / 3_600_000);
}

function toWireItem(item: RssItem, source: RssSource): RssWireItem {
  return {
    ...item,
    kind: "rss",
    sourceDisplayName: source.displayName,
    city: source.city,
    country: source.country,
    lat: source.lat,
    lng: source.lng,
    lang: source.lang,
  };
}

/**
 * Build the public RssWireResult shape from the four pieces the Redis
 * adapter retrieves: ordered item-ids (desc by publishedTs), items
 * keyed by id, source-statuses keyed by sourceId, global meta, and the
 * registry of sources to render.
 *
 * Deterministic and pure — same inputs → same output. Safe to test.
 */
export function assembleRssWire(opts: {
  orderedIds: string[];
  itemsMap: Map<string, RssItem>;
  statusMap: Map<string, RssSourceStatus>;
  meta: RssIngestMeta | null;
  sources: readonly RssSource[];
  nowMs: number;
  source: "redis" | "unavailable";
}): RssWireResult {
  const { orderedIds, itemsMap, statusMap, meta, sources, nowMs } = opts;
  const polledAt = new Date(nowMs).toISOString();

  const sourceById = new Map<string, RssSource>(
    sources.map((s) => [s.id, s]),
  );

  const wireItems: RssWireItem[] = [];
  const perSourceRecent = new Map<string, RssWireItem[]>();
  const cutoff24h = Math.floor(nowMs / 1000) - 24 * 60 * 60;

  for (const id of orderedIds) {
    const it = itemsMap.get(id);
    if (!it) continue;
    const src = sourceById.get(it.sourceId);
    if (!src) continue;
    const wire = toWireItem(it, src);
    wireItems.push(wire);
    const bucket = perSourceRecent.get(src.id) ?? [];
    if (bucket.length < RSS_RECENT_ITEMS_PER_SOURCE) {
      bucket.push(wire);
      perSourceRecent.set(src.id, bucket);
    }
  }

  const panelSources: RssSourcePanel[] = sources.map((src) => {
    const itemsForSource = wireItems.filter((i) => i.sourceId === src.id);
    const itemsLast24h = itemsForSource.filter(
      (i) => i.publishedTs >= cutoff24h,
    ).length;
    const status = statusMap.get(src.id);
    const lastFetchOkTs = status?.lastFetchOkTs ?? null;
    const staleHoursFloat = hoursSince(lastFetchOkTs, nowMs);
    const stale =
      staleHoursFloat === null || staleHoursFloat > RSS_STALE_HOURS_THRESHOLD;
    return {
      id: src.id,
      displayName: src.displayName,
      city: src.city,
      country: src.country,
      lat: src.lat,
      lng: src.lng,
      lang: src.lang,
      hqSourceUrl: src.hqSourceUrl,
      publisherUrl: src.publisherUrl,
      rssUrl: src.rssUrl,
      feedFormat: src.feedFormat,
      keywordFilterScope: src.keywordFilterScope,
      caveat: src.caveat,
      itemsLast24h,
      itemsLast7d: itemsForSource.length,
      recentItems: perSourceRecent.get(src.id) ?? [],
      lastFetchOkTs,
      lastError: status?.lastError ?? null,
      staleHours: staleHoursFloat === null ? null : Math.round(staleHoursFloat),
      stale,
    };
  });

  const lastFetchOkTs = meta?.lastFetchOkTs ?? null;
  const staleMinutes = lastFetchOkTs
    ? Math.max(
        0,
        Math.round((nowMs - new Date(lastFetchOkTs).getTime()) / 60_000),
      )
    : null;

  return {
    ok: true,
    sources: panelSources,
    items: wireItems,
    polledAt,
    meta: { lastFetchOkTs, staleMinutes },
    source: opts.source,
  };
}

/** The minimal store interface runRssIngest depends on — allows test doubles. */
export interface RssStoreSink {
  writeItem(item: RssItem): Promise<void>;
  readItem(id: string): Promise<RssItem | null>;
  zaddWire(id: string, score: number): Promise<void>;
  zpruneWire(cutoffSecs: number): Promise<number>;
  writeSource(status: RssSourceStatus): Promise<void>;
  writeMeta(meta: RssIngestMeta): Promise<void>;
}

// ---------------------------------------------------------------------------
// Keyword lists (ai-only scope)
// ---------------------------------------------------------------------------

/** English keywords shared with the HN filter. */
export const KEYWORD_ALLOWLIST_EN: readonly string[] = [
  "ai ",
  " ai",
  "openai",
  "anthropic",
  "claude",
  "gpt",
  "llm",
  "gemini",
  "mistral",
  "llama",
  "ollama",
  "deepseek",
  "qwen",
  "transformer",
  "diffusion",
  "embedding",
  "agent",
  "agentic",
  "mcp",
  "copilot",
  "cursor",
  "fine-tun",
  "fine tuning",
  "rag",
  "rlhf",
  "huggingface",
  "stable diffusion",
  "midjourney",
  "neural",
  "machine learning",
  "deep learning",
] as const;

/** German-language additions (brand names fall through to English). */
export const KEYWORD_ALLOWLIST_DE: readonly string[] = [
  "ki ",
  "ki-",
  " ki,",
  " ki.",
  "künstliche intelligenz",
  "sprachmodell",
  "maschinelles lernen",
  "generativ",
  "chatbot",
  "neuronale",
] as const;

/**
 * Deterministic AI-relevance check for RSS items. Called only when the
 * source's keywordFilterScope is "ai-only". English list is always
 * consulted (brand names are language-agnostic). German list is added
 * for de-language feeds.
 */
export function isRssAiRelevant(title: string, lang: string): boolean {
  const t = title.toLowerCase();
  for (const kw of KEYWORD_ALLOWLIST_EN) {
    if (t.includes(kw)) return true;
  }
  if (lang === "de") {
    for (const kw of KEYWORD_ALLOWLIST_DE) {
      if (t.includes(kw)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Hand-rolled XML tag extractor. Targets well-formed RSS 2.0 / Atom
 * feeds in the wild; not a full XML parser. Handles CDATA sections and
 * attribute-bearing tags like <link href="..."/>.
 */
function stripCData(raw: string): string {
  const m = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (m) return m[1].trim();
  return raw.trim();
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractTagText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  return decodeXmlEntities(stripCData(m[1]));
}

function extractAtomLink(block: string): string {
  // Prefer rel="alternate" if present, else first <link href="..."/>.
  const alt = block.match(
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i,
  );
  if (alt) return decodeXmlEntities(alt[1]);
  const any = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
  if (any) return decodeXmlEntities(any[1]);
  return "";
}

export function parseRss20(xml: string): RssRawItem[] {
  if (!xml || !xml.includes("<item")) return [];
  const out: RssRawItem[] = [];
  try {
    const re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const block = m[1];
      const title = extractTagText(block, "title");
      const link = extractTagText(block, "link");
      const pubDate = extractTagText(block, "pubDate");
      const guid = extractTagText(block, "guid");
      const description = extractTagText(block, "description");
      out.push({ title, link, pubDate, guid, description });
    }
  } catch {
    return [];
  }
  return out;
}

export function parseAtom(xml: string): RssRawItem[] {
  if (!xml || !xml.includes("<entry")) return [];
  const out: RssRawItem[] = [];
  try {
    const re = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const block = m[1];
      const title = extractTagText(block, "title");
      const link = extractAtomLink(block);
      const id = extractTagText(block, "id");
      const published = extractTagText(block, "published");
      const updated = extractTagText(block, "updated");
      const summary = extractTagText(block, "summary");
      const content = summary || extractTagText(block, "content");
      out.push({
        title,
        link,
        pubDate: published || updated,
        guid: id,
        description: content,
      });
    }
  } catch {
    return [];
  }
  return out;
}

/** Format-dispatching parser. */
export function parseFeed(xml: string, format: "rss" | "atom"): RssRawItem[] {
  return format === "atom" ? parseAtom(xml) : parseRss20(xml);
}

// ---------------------------------------------------------------------------
// Item id + normalisation
// ---------------------------------------------------------------------------

/**
 * Stable per-item id. SHA-1 over (sourceId · key) truncated to 16 hex
 * chars. Collision risk over 5 feeds × 100 items/day is negligible.
 */
export function computeItemId(sourceId: string, key: string): string {
  const h = createHash("sha1");
  h.update(sourceId + "\u00b7" + key);
  return h.digest("hex").slice(0, 16);
}

/**
 * Normalise a raw feed item into the stored shape. Returns null when
 * any required field is missing or the timestamp is unparseable.
 */
export function normaliseItem(
  raw: RssRawItem,
  source: RssSource,
  nowIso: string,
): RssItem | null {
  if (!raw.title || !raw.link) return null;
  const publishedMs = raw.pubDate ? Date.parse(raw.pubDate) : NaN;
  if (!Number.isFinite(publishedMs)) return null;
  const key = raw.guid || raw.link;
  const id = computeItemId(source.id, key);
  return {
    id,
    sourceId: source.id,
    title: raw.title,
    url: raw.link,
    publishedTs: Math.floor(publishedMs / 1000),
    firstSeenTs: nowIso,
    lastRefreshTs: nowIso,
    description: raw.description ?? "",
  };
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/** Default fetcher — overridable by tests and by the ingest route. */
export async function defaultRssFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.1",
      "user-agent": "aipulse-wire-rss/1.0 (+https://gawk.dev)",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} -> ${res.status}`);
  }
  return await res.text();
}

export type RssFetchFn = (url: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const SEVEN_DAYS_SECS = 7 * 24 * 60 * 60;

export async function runRssIngest(opts: {
  sources: readonly RssSource[];
  fetchFn?: RssFetchFn;
  store: RssStoreSink;
  now?: Date;
}): Promise<RssIngestResult> {
  const fetchFn = opts.fetchFn ?? defaultRssFetch;
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const nowSec = Math.floor(now.getTime() / 1000);
  const cutoff = nowSec - SEVEN_DAYS_SECS;

  const perSource: RssIngestResult["sources"] = [];
  let okCount = 0;
  let failCount = 0;
  let lastError: string | null = null;

  for (const source of opts.sources) {
    let xml = "";
    let err: string | null = null;
    try {
      xml = await fetchFn(source.rssUrl);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }

    let raw: RssRawItem[] = [];
    let written = 0;
    let filtered = 0;

    if (err === null) {
      raw = parseFeed(xml, source.feedFormat);
      for (const r of raw) {
        // AI-filter (only when scope === ai-only)
        if (source.keywordFilterScope === "ai-only") {
          if (!isRssAiRelevant(r.title, source.lang)) {
            filtered += 1;
            continue;
          }
        }
        const item = normaliseItem(r, source, nowIso);
        if (!item) {
          filtered += 1;
          continue;
        }
        try {
          // Firstseen preservation — mirror HN: if the item exists, keep
          // its firstSeenTs.
          const existing = await opts.store.readItem(item.id);
          const merged: RssItem = existing
            ? { ...item, firstSeenTs: existing.firstSeenTs }
            : item;
          await opts.store.writeItem(merged);
          await opts.store.zaddWire(item.id, item.publishedTs);
          written += 1;
        } catch {
          // individual write failures are non-fatal to the batch
        }
      }
      okCount += 1;
    } else {
      failCount += 1;
      lastError = err;
    }

    const status: RssSourceStatus = {
      id: source.id,
      lastFetchOkTs: err === null ? nowIso : null,
      lastFetchAttemptTs: nowIso,
      lastError: err,
      itemsSeenTotal: raw.length,
      itemsWritten24h: written,
    };
    try {
      await opts.store.writeSource(status);
    } catch {
      // no-op
    }

    perSource.push({
      id: source.id,
      fetched: raw.length,
      filtered,
      written,
      error: err,
    });
  }

  try {
    await opts.store.zpruneWire(cutoff);
  } catch {
    // no-op
  }

  try {
    const meta: RssIngestMeta = {
      lastFetchOkTs: okCount > 0 ? nowIso : null,
      lastFetchAttemptTs: nowIso,
      lastError,
      sourcesOk: okCount,
      sourcesFailed: failCount,
    };
    await opts.store.writeMeta(meta);
  } catch {
    // no-op
  }

  return {
    ok: failCount === 0,
    sources: perSource,
    at: nowIso,
  };
}
