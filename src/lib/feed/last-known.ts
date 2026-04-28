/**
 * Gawk — Last-known cache wrapper for live-fetch feed sources.
 *
 * Wraps an upstream fetch so that a successful response is written to
 * Upstash Redis under `feed:lk:{key}` and a failed response falls back
 * to whatever was last written. The caller receives both the data and
 * a `staleAsOf` ISO timestamp — null when the response is fresh, set
 * to the cached `savedAt` when the live fetch failed and we served
 * from cache.
 *
 * Trust contract: a cached value carries the timestamp it was captured
 * at, so the UI can surface "as of $time" rather than silently serving
 * stale data. Per CodePulse V1 lesson: don't suppress the staleness,
 * publish it.
 */

import { Redis } from "@upstash/redis";

export type LastKnownResult<T> = {
  data: T;
  /** ISO timestamp of the cached payload when fresh fetch failed; null on fresh success. */
  staleAsOf: string | null;
};

type Envelope<T> = {
  data: T;
  savedAt: string;
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

/**
 * Test-only seam — lets unit tests inject a fake Redis client.
 * The factory is consulted on every call so tests can flip behaviour
 * between cases without module-cache shenanigans.
 */
let redisOverride: (() => Redis | null) | null = null;

export function __setRedisOverrideForTests(
  factory: (() => Redis | null) | null,
): void {
  redisOverride = factory;
  cached = undefined;
}

function client(): Redis | null {
  if (redisOverride) return redisOverride();
  return redis();
}

const KEY_PREFIX = "feed:lk:";

export async function withLastKnown<T>(
  key: string,
  fresh: () => Promise<T>,
  fallback: T,
): Promise<LastKnownResult<T>> {
  let freshErr: unknown;
  try {
    const data = await fresh();
    void writeThrough(key, data);
    return { data, staleAsOf: null };
  } catch (err) {
    freshErr = err;
  }

  const r = client();
  if (r) {
    try {
      const envelope = await r.get<Envelope<T>>(`${KEY_PREFIX}${key}`);
      if (envelope && typeof envelope.savedAt === "string") {
        console.error(
          `[feed:last-known] ${key} fresh failed, serving cache from ${envelope.savedAt}`,
          freshErr,
        );
        return { data: envelope.data, staleAsOf: envelope.savedAt };
      }
    } catch (cacheErr) {
      console.error(
        `[feed:last-known] ${key} cache read failed`,
        cacheErr,
      );
    }
  }

  console.error(
    `[feed:last-known] ${key} fresh failed and no cache available`,
    freshErr,
  );
  return { data: fallback, staleAsOf: null };
}

async function writeThrough<T>(key: string, data: T): Promise<void> {
  const r = client();
  if (!r) return;
  try {
    const envelope: Envelope<T> = { data, savedAt: new Date().toISOString() };
    await r.set(`${KEY_PREFIX}${key}`, JSON.stringify(envelope));
  } catch (err) {
    console.error(`[feed:last-known] ${key} write-through failed`, err);
  }
}
