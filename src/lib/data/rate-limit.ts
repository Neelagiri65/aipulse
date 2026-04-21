/**
 * rate-limit — narrow INCR + EXPIRE helper backed by Upstash.
 *
 * Consumer patterns:
 *   subscribe: 5 / ipHash / hour
 *   confirm:   10 / ipHash / hour
 *   consent:   30 / visitor / hour (cheap, but caps accidental loops)
 *
 * Returns {allowed, remaining, resetAt}. Fail-open when Redis is
 * unconfigured so local dev doesn't require Redis — paired with the
 * belt-and-braces Turnstile gate on user-facing endpoints, this is
 * acceptable (the gate holds even if the counter doesn't).
 */

import { Redis } from "@upstash/redis";

export type RateLimitClient = Pick<Redis, "incr" | "expire" | "ttl">;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

let cached: Redis | null | undefined;

function defaultClient(): RateLimitClient | null {
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

export function __resetRateLimitClientCache(): void {
  cached = undefined;
}

export type CheckOptions = {
  client?: RateLimitClient;
  now?: () => number;
};

export async function checkAndIncrement(
  key: string,
  limit: number,
  windowSec: number,
  opts: CheckOptions = {},
): Promise<RateLimitResult> {
  const r = opts.client ?? defaultClient();
  const now = opts.now?.() ?? Date.now();
  if (!r) {
    return { allowed: true, remaining: limit - 1, resetAt: now + windowSec * 1000 };
  }
  try {
    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, windowSec);
    }
    const ttl = (await r.ttl(key)) ?? windowSec;
    const resetAt = now + Math.max(0, ttl) * 1000;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch {
    return { allowed: true, remaining: limit - 1, resetAt: now + windowSec * 1000 };
  }
}
