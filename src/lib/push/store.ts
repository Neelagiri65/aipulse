/**
 * Push subscription storage in Upstash Redis.
 *
 * Key pattern: push:sub:{hash} where hash is a truncated SHA-256 of the
 * endpoint URL (deduplication). Value is the full PushSubscription JSON.
 *
 * List operations use SCAN with push:sub:* pattern to iterate.
 */

import { Redis } from "@upstash/redis";
import type { PushSubscription } from "web-push";

const KEY_PREFIX = "push:sub:";
const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

function loadRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function hashEndpoint(endpoint: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(endpoint);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function savePushSubscription(
  sub: PushSubscription,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const redis = loadRedis();
  if (!redis) return { ok: false, error: "redis_unavailable" };

  const id = await hashEndpoint(sub.endpoint);
  const key = `${KEY_PREFIX}${id}`;
  await redis.set(key, JSON.stringify(sub), { ex: TTL_SECONDS });
  return { ok: true, id };
}

export async function removePushSubscription(
  endpoint: string,
): Promise<{ ok: boolean }> {
  const redis = loadRedis();
  if (!redis) return { ok: false };

  const id = await hashEndpoint(endpoint);
  await redis.del(`${KEY_PREFIX}${id}`);
  return { ok: true };
}

export async function getAllPushSubscriptions(): Promise<PushSubscription[]> {
  const redis = loadRedis();
  if (!redis) return [];

  const subs: PushSubscription[] = [];
  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: `${KEY_PREFIX}*`,
      count: 50,
    });
    cursor = Number(nextCursor);
    if (keys.length > 0) {
      const values = await Promise.all(keys.map((k) => redis.get<string>(k)));
      for (const v of values) {
        if (v) {
          try {
            subs.push(typeof v === "string" ? JSON.parse(v) : v as unknown as PushSubscription);
          } catch {
            // skip malformed
          }
        }
      }
    }
  } while (cursor !== 0);

  return subs;
}
