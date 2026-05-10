/**
 * Hacker News ingest — pure-logic layer.
 *
 * This module contains the deterministic filter + string-parsing helpers.
 * No network I/O here; fetchers and Redis writes land in HN-02/HN-03.
 *
 * Trust contract (mirrors CLAUDE.md non-negotiables):
 *   - AI relevance is a deterministic keyword/domain match, never an LLM
 *     classification. The allowlists are pre-committed to the codebase
 *     and exported so tests and caveats can reference them.
 *   - Soft blacklist drops noise that matches `AI` but isn't ecosystem-
 *     relevant (crypto pump-and-dump, adult content, etc.).
 *   - Location parsing is fail-soft: unparseable HTML or empty input
 *     returns null; story still shows in WIRE, just never on the map.
 */

/** Minimum HN points required for a story to enter the wire. */
export const HN_MIN_WIRE_POINTS = 5;

import type { GlobePoint } from "@/components/globe/Globe";
import { geocode } from "@/lib/geocoding";
import {
  isHnStoreAvailable,
  readAuthor,
  readItems,
  writeAuthor,
  writeItem,
  writeMeta,
  zaddWire,
  zpruneWire,
  readWireIds,
  type HnIngestMeta,
} from "@/lib/data/hn-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by hn.algolia.com/api/v1/search_by_date. */
export type HnStoryRaw = {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at_i: number;
  created_at: string;
};

/** Stored shape for an HN item. Written on every poll; first_seen_ts is
 *  preserved across overwrites so we keep the original sighting time. */
export type HnItem = {
  id: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  numComments: number;
  createdAtI: number;
  createdAt: string;
  firstSeenTs: string;
  lastRefreshTs: string;
};

/** Cached author location. TTL 7d in Redis. */
export type HnAuthor = {
  username: string;
  rawLocation: string | null;
  lat: number | null;
  lng: number | null;
  resolvedAtTs: string;
  resolveStatus: "ok" | "no_location" | "geocode_failed";
};

/** Wire-ready HN item. Used by THE WIRE panel and the map. */
export type HnWireItem = HnItem & {
  kind: "hn";
  lat: number | null;
  lng: number | null;
  locationLabel: string | null;
};

/** Shape exposed by GET /api/hn. */
export type HnWireResult = {
  ok: boolean;
  items: HnWireItem[];
  points: GlobePoint[];
  polledAt: string;
  coverage: {
    itemsTotal: number;
    itemsWithLocation: number;
    geocodeResolutionPct: number;
  };
  meta: {
    lastFetchOkTs: string | null;
    staleMinutes: number | null;
  };
  source: "redis" | "unavailable";
};

// ---------------------------------------------------------------------------
// Filter — deterministic keyword + domain + blacklist
// ---------------------------------------------------------------------------

/**
 * Keywords that flag a title as AI-ecosystem-relevant. Case-insensitive
 * substring match. Pre-committed; changes require an Auditor-flagged
 * commit so sanity-range drift is traceable.
 */
export const KEYWORD_ALLOWLIST: readonly string[] = [
  // Model / platform names
  "claude", "gpt", "llm", "openai", "anthropic", "gemini", "mistral",
  "llama", "ollama", "deepseek", "qwen",
  // Tools
  "cursor", "copilot", "langchain", "huggingface", "windsurf", "codex",
  "devin",
  // Techniques / primitives
  "transformer", "diffusion", "embedding", "rag", "agent", "agentic",
  "mcp", "stable diffusion", "midjourney", "sdxl",
  "fine-tuning", "fine tuning", "prompt engineering",
  "ai safety", "alignment", "rlhf", "inference", "quantization",
  // Phrases (common in HN titles)
  "vibe coding", "ai coding",
] as const;

/**
 * Domain suffixes that flag a story as AI-ecosystem-relevant regardless
 * of title. Matched as case-insensitive suffix of the URL host, so
 * subdomains (beta.huggingface.co) match their parent domain.
 */
export const DOMAIN_ALLOWLIST: readonly string[] = [
  "arxiv.org",
  "huggingface.co",
  "anthropic.com",
  "openai.com",
  "mistral.ai",
  "deepmind.com",
  "deepmind.google",
  "ai.google.dev",
  "ai.meta.com",
  "ollama.com",
  "langchain.com",
  "llamaindex.ai",
  "cursor.sh",
  "codeium.com",
  "windsurf.dev",
] as const;

/**
 * Substrings in the title that drop the story regardless of keyword or
 * domain match. Case-insensitive. Keep this list minimal — the goal is
 * to filter out obvious noise, not to editorialise.
 */
export const SOFT_BLACKLIST: readonly string[] = [
  "crypto",
  "girlfriend",
  "nsfw",
] as const;

/**
 * Deterministic AI-relevance check. Title + URL host are both
 * considered; blacklist wins over both allowlists.
 */
export function isAiRelevant(title: string, urlHost: string): boolean {
  const t = title.toLowerCase();
  const h = urlHost.toLowerCase();

  // Blacklist first — drops the story even if it otherwise matches.
  for (const bad of SOFT_BLACKLIST) {
    if (t.includes(bad)) return false;
  }

  // Empty title + empty host = nothing to match on.
  if (!t && !h) return false;

  // Keyword match in title.
  for (const kw of KEYWORD_ALLOWLIST) {
    if (t.includes(kw)) return true;
  }

  // Domain suffix match.
  if (h) {
    for (const d of DOMAIN_ALLOWLIST) {
      if (h === d || h.endsWith("." + d)) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// URL + location string parsing
// ---------------------------------------------------------------------------

/**
 * Extract the lowercase host from a URL. Returns empty string on null,
 * invalid URLs, or bare hostnames without a scheme. Callers must treat
 * empty host as "no domain signal" and fall back to keyword check.
 */
export function hostFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Parse an HN user's `about` field into a candidate location string.
 * Strategy:
 *   1. Strip HTML tags (HN renders links as <a>, breaks as <p>, etc.).
 *   2. Split on newlines.
 *   3. Take the first non-empty line.
 *   4. Trim.
 * Returns null when the field is empty or contains no text after
 * stripping.
 *
 * Why only the first line? HN convention is that users lead with their
 * location ("Berlin, Germany. Building things since 2003."). The trailing
 * prose is autobiography we don't need. Taking only the first line keeps
 * the geocoder input tight and avoids matching city names inside
 * unrelated sentences.
 */
export function extractLocation(aboutField: string | null | undefined): string | null {
  if (!aboutField) return null;
  const stripped = aboutField.replace(/<[^>]*>/g, "");
  const lines = stripped.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

const ALGOLIA_ENDPOINT =
  "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=";
const HN_USER_ENDPOINT =
  "https://hacker-news.firebaseio.com/v0/user/";

/**
 * Fetch the most-recent stories from the Algolia HN search API. No
 * server-side keyword filter — we apply isAiRelevant locally so the
 * pre-filter count is available for sanity-range reporting.
 */
export async function fetchAlgolia(limit = 100): Promise<HnStoryRaw[]> {
  const url = ALGOLIA_ENDPOINT + limit;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`algolia ${res.status}`);
  }
  const body = (await res.json()) as { hits?: unknown[] };
  const hits = Array.isArray(body.hits) ? body.hits : [];
  const out: HnStoryRaw[] = [];
  for (const h of hits) {
    if (!h || typeof h !== "object") continue;
    const o = h as Record<string, unknown>;
    if (
      typeof o.objectID !== "string" ||
      typeof o.title !== "string" ||
      typeof o.author !== "string" ||
      typeof o.created_at_i !== "number" ||
      typeof o.created_at !== "string"
    ) {
      continue;
    }
    out.push({
      objectID: o.objectID,
      title: o.title,
      url: typeof o.url === "string" ? o.url : null,
      author: o.author,
      points: typeof o.points === "number" ? o.points : 0,
      num_comments:
        typeof o.num_comments === "number" ? o.num_comments : 0,
      created_at_i: o.created_at_i,
      created_at: o.created_at,
    });
  }
  return out;
}

/** Fetch a single HN user's public profile. Returns null on 404 /
 *  unexpected shape. `about` may be HTML-formatted HN markup. */
export async function fetchHnUser(
  username: string,
): Promise<{ about: string | null } | null> {
  const res = await fetch(HN_USER_ENDPOINT + encodeURIComponent(username) + ".json", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { about?: unknown } | null;
  if (!body || typeof body !== "object") return null;
  const about = typeof body.about === "string" ? body.about : null;
  return { about };
}

// ---------------------------------------------------------------------------
// Orchestration — runIngest
// ---------------------------------------------------------------------------

export type IngestResult = {
  ok: boolean;
  fetched: number;
  passed: number;
  written: number;
  geocoded: number;
  geocodeAttempted: number;
  failures: Array<{ step: string; message: string }>;
  source: string;
  at: string;
};

/**
 * Full ingest pass. Called by /api/wire/ingest-hn on the cron.
 *
 * 1. Fetch Algolia top N (default 100).
 * 2. Filter with isAiRelevant; cap at `cap` (default 20).
 * 3. Per story: look up cached author. Cache-miss → fetch Firebase,
 *    extract location, geocode, write to hn:author:*.
 * 4. Per story: write hn:item:* (merging firstSeenTs via hn-store).
 * 5. ZADD every story id to hn:wire.
 * 6. Prune hn:wire ZSET older than (now - 24h).
 * 7. Write hn:meta with sanity-range counts.
 *
 * Graceful on Redis absence: runs fetchers + geocoder, returns counts,
 * skips all Redis writes.
 */
export async function runIngest(opts: {
  cap?: number;
  source?: string;
  fetchLimit?: number;
}): Promise<IngestResult> {
  const cap = Math.max(1, Math.min(opts.cap ?? 20, 20));
  const fetchLimit = Math.max(20, Math.min(opts.fetchLimit ?? 100, 200));
  const source = opts.source ?? "cron";
  const now = new Date();
  const nowIso = now.toISOString();
  const nowSec = Math.floor(now.getTime() / 1000);
  const failures: Array<{ step: string; message: string }> = [];
  const storeOn = isHnStoreAvailable();

  let raw: HnStoryRaw[] = [];
  try {
    raw = await fetchAlgolia(fetchLimit);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push({ step: "fetchAlgolia", message: msg });
    if (storeOn) {
      const meta: HnIngestMeta = {
        lastFetchOkTs: null,
        lastFetchAttemptTs: nowIso,
        lastError: msg,
        itemsSeenTotal: 0,
        lastFilterPassCount: 0,
        geocodeResolutionPct: 0,
      };
      await writeMeta(meta);
    }
    return {
      ok: false,
      fetched: 0,
      passed: 0,
      written: 0,
      geocoded: 0,
      geocodeAttempted: 0,
      failures,
      source,
      at: nowIso,
    };
  }

  const passed: HnStoryRaw[] = [];
  for (const s of raw) {
    const host = hostFromUrl(s.url);
    if (isAiRelevant(s.title, host) && s.points >= HN_MIN_WIRE_POINTS) passed.push(s);
    if (passed.length >= cap) break;
  }

  let written = 0;
  let geocoded = 0;
  let geocodeAttempted = 0;

  for (const s of passed) {
    // Author location resolution.
    if (storeOn) {
      try {
        const cached = await readAuthor(s.author);
        if (!cached) {
          geocodeAttempted += 1;
          let author: HnAuthor;
          try {
            const user = await fetchHnUser(s.author);
            const rawLoc = extractLocation(user?.about ?? null);
            if (!rawLoc) {
              author = {
                username: s.author,
                rawLocation: null,
                lat: null,
                lng: null,
                resolvedAtTs: nowIso,
                resolveStatus: "no_location",
              };
            } else {
              const coords = geocode(rawLoc);
              if (coords) {
                author = {
                  username: s.author,
                  rawLocation: rawLoc,
                  lat: coords[0],
                  lng: coords[1],
                  resolvedAtTs: nowIso,
                  resolveStatus: "ok",
                };
                geocoded += 1;
              } else {
                author = {
                  username: s.author,
                  rawLocation: rawLoc,
                  lat: null,
                  lng: null,
                  resolvedAtTs: nowIso,
                  resolveStatus: "geocode_failed",
                };
              }
            }
            await writeAuthor(author);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            failures.push({ step: `fetchHnUser:${s.author}`, message: msg });
          }
        } else if (cached.resolveStatus === "ok") {
          geocoded += 1;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({ step: `readAuthor:${s.author}`, message: msg });
      }
    }

    // Item write + ZADD.
    const item: HnItem = {
      id: s.objectID,
      title: s.title,
      url: s.url,
      author: s.author,
      points: s.points,
      numComments: s.num_comments,
      createdAtI: s.created_at_i,
      createdAt: s.created_at,
      firstSeenTs: nowIso,
      lastRefreshTs: nowIso,
    };
    if (storeOn) {
      await writeItem(item);
      await zaddWire(s.objectID, s.created_at_i);
    }
    written += 1;
  }

  // Prune ZSET members with score older than 24h.
  if (storeOn) {
    const cutoff = nowSec - 24 * 60 * 60;
    try {
      await zpruneWire(cutoff);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ step: "zpruneWire", message: msg });
    }
    // Light reconciliation: count ZSET members whose item keys no
    // longer exist (24h TTL expired) and remove them from the ZSET.
    try {
      const ids = await readWireIds();
      if (ids.length > 0) {
        const existing = await readItems(ids);
        const orphaned = ids.filter((id) => !existing.has(id));
        if (orphaned.length > 0) {
          const { zremWire } = await import("@/lib/data/hn-store");
          for (const id of orphaned) await zremWire(id);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ step: "reconcileOrphans", message: msg });
    }
  }

  const geocodeResolutionPct =
    geocodeAttempted > 0 ? (geocoded / geocodeAttempted) * 100 : 0;

  if (storeOn) {
    const meta: HnIngestMeta = {
      lastFetchOkTs: nowIso,
      lastFetchAttemptTs: nowIso,
      lastError: null,
      itemsSeenTotal: raw.length,
      lastFilterPassCount: passed.length,
      geocodeResolutionPct: Math.round(geocodeResolutionPct),
    };
    await writeMeta(meta);
  }

  return {
    ok: true,
    fetched: raw.length,
    passed: passed.length,
    written,
    geocoded,
    geocodeAttempted,
    failures,
    source,
    at: nowIso,
  };
}
