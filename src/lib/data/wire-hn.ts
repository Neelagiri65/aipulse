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

import type { GlobePoint } from "@/components/globe/Globe";

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
