/**
 * Digest send errors — append-only log per date, for ops-visibility.
 *
 * Shape:
 *   digest:errors:{YYYY-MM-DD}   LPUSH JSON entries, no TTL.
 *
 * Kept separate from the DigestBody archive so a partial-failure write
 * doesn't tamper with the canonical body. Read-path (admin preview /
 * cron-health UI) exposes recent entries.
 *
 * Fail-soft: writes no-op on Redis absence. Never throws.
 */

import { Redis } from "@upstash/redis";

const KEY_PREFIX = "digest:errors:";

export type DigestErrorEntry = {
  at: string;
  kind: "domain-verify" | "batch-5xx" | "batch-4xx" | "bounce" | "unknown";
  subject: string;
  message: string;
  hash?: string;
};

export type DigestErrorsClient = Pick<Redis, "lpush" | "lrange">;

let cached: Redis | null | undefined;

function defaultClient(): DigestErrorsClient | null {
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

export function __resetDigestErrorsClientCache(): void {
  cached = undefined;
}

export function errorsKey(date: string): string {
  return `${KEY_PREFIX}${date}`;
}

type Opts = { client?: DigestErrorsClient };

export async function appendDigestError(
  date: string,
  entry: DigestErrorEntry,
  opts: Opts = {},
): Promise<void> {
  const r = opts.client ?? defaultClient();
  if (!r) return;
  try {
    await r.lpush(errorsKey(date), JSON.stringify(entry));
  } catch {
    /* fail-soft */
  }
}

export async function readDigestErrors(
  date: string,
  limit = 50,
  opts: Opts = {},
): Promise<DigestErrorEntry[]> {
  const r = opts.client ?? defaultClient();
  if (!r) return [];
  try {
    const raw = await r.lrange(errorsKey(date), 0, Math.max(0, limit - 1));
    const out: DigestErrorEntry[] = [];
    for (const s of raw) {
      const parsed = parseEntry(s);
      if (parsed) out.push(parsed);
    }
    return out;
  } catch {
    return [];
  }
}

function parseEntry(value: unknown): DigestErrorEntry | null {
  if (!value) return null;
  try {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.at !== "string" ||
      typeof o.kind !== "string" ||
      typeof o.message !== "string"
    ) {
      return null;
    }
    return obj as DigestErrorEntry;
  } catch {
    return null;
  }
}
