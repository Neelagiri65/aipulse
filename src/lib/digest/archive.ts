/**
 * Digest archive store — one Redis blob per UTC-day digest, no TTL.
 *
 * Shape:
 *   digest:{YYYY-MM-DD}   SET (JSON), no TTL.
 *
 * Why no TTL? The `/digest/{date}` public page renders from this store
 * whenever a subscriber clicks "View on AI Pulse" in an email they've
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
