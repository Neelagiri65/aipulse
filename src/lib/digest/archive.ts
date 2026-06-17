/**
 * Digest archive store — one Redis blob per UTC-day digest, no TTL.
 *
 * Shape:
 *   digest:{YYYY-MM-DD}   SET (JSON), no TTL.
 *
 * Why no TTL? The `/digest/{date}` public page renders from this store
 * whenever a subscriber clicks "View on Gawk" in an email they've
 * kept for weeks or months. Email clients archive indefinitely; our
 * archive has to match. A year of digests at ~10 KB each is ~3.6 MB —
 * well under Upstash free-tier limits.
 *
 * No index ZSET yet: the only read path is by known date (from the
 * public route param or the send job). If we ever need "list all
 * archived dates" we'll add `digest:index` in a follow-up.
 *
 * Fail-soft: Redis absence → writes no-op, reads return null. Never
 * throws; callers treat "unavailable" as the response.
 */

import { Redis } from "@upstash/redis";
import type { DigestBody } from "@/lib/digest/types";

const KEY_PREFIX = "digest:";

export type DigestArchiveClient = Pick<Redis, "get" | "set" | "del">;
/** Client surface for enumerating archived digests (sitemap). */
export type DigestArchiveScanClient = Pick<Redis, "scan">;

let cached: Redis | null | undefined;

function defaultClient(): DigestArchiveClient | null {
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

export function __resetDigestArchiveClientCache(): void {
  cached = undefined;
}

export function isDigestArchiveAvailable(): boolean {
  return defaultClient() !== null;
}

export function digestArchiveKey(date: string): string {
  return `${KEY_PREFIX}${date}`;
}

/**
 * Enumerate the dates (newest first) that have an archived digest. Used by the
 * sitemap to expose `/digest/<date>` pages for crawling. Fail-soft: returns []
 * if Redis is unavailable or scan errors — a sitemap must never throw. SCANs
 * `digest:*` with pagination so it works regardless of archive size.
 */
export async function listDigestDates(opts: {
  client?: DigestArchiveScanClient;
} = {}): Promise<string[]> {
  const r = opts.client ?? (defaultClient() as DigestArchiveScanClient | null);
  if (!r) return [];
  try {
    const dates: string[] = [];
    let cursor = "0";
    do {
      const [next, keys] = await r.scan(cursor, {
        match: `${KEY_PREFIX}*`,
        count: 100,
      });
      cursor = String(next);
      for (const k of keys) {
        const date = k.slice(KEY_PREFIX.length);
        // Only return clean ISO dates. A stray non-date `digest:*` key would
        // otherwise reach `new Date(...).toISOString()` in the sitemap and
        // throw (RangeError: Invalid time value) → a 500 on /sitemap.xml.
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date);
      }
    } while (cursor !== "0");
    return dates.sort().reverse();
  } catch {
    return [];
  }
}

type Opts = { client?: DigestArchiveClient };

/** Overwrite the archive entry for `date`. Never throws. */
export async function writeDigestBody(
  date: string,
  body: DigestBody,
  opts: Opts = {},
): Promise<void> {
  const r = opts.client ?? defaultClient();
  if (!r) return;
  try {
    await r.set(digestArchiveKey(date), JSON.stringify(body));
  } catch {
    // archive failure must not break the send pipeline
  }
}

/** Read the archive entry for `date`. Null if missing, unparseable, or
 *  Redis unavailable. */
export async function readDigestBody(
  date: string,
  opts: Opts = {},
): Promise<DigestBody | null> {
  const r = opts.client ?? defaultClient();
  if (!r) return null;
  try {
    const v = await r.get(digestArchiveKey(date));
    return parseBody(v);
  } catch {
    return null;
  }
}

function parseBody(value: unknown): DigestBody | null {
  if (!value) return null;
  try {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.date !== "string" ||
      typeof o.subject !== "string" ||
      typeof o.mode !== "string" ||
      typeof o.greetingTemplate !== "string" ||
      typeof o.generatedAt !== "string" ||
      !Array.isArray(o.sections)
    ) {
      return null;
    }
    return obj as DigestBody;
  } catch {
    return null;
  }
}
