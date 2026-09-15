/**
 * Push subscription storage in Upstash Redis.
 *
 * Key pattern: push:sub:{hash} where hash is a truncated SHA-256 of the
 * endpoint URL (deduplication). Value is a PushRecord: the browser's
 * PushSubscription fields plus, optionally, the visitor's stack (`tools`)
 * at the time they enabled alerts or last changed it while alerts were on.
 * A record with no `tools` wants every alert — that is also what every
 * record written before the stack existed means.
 *
 * List operations use SCAN with push:sub:* pattern to iterate.
 */

import type { Redis } from "@upstash/redis";
import { createRedis } from "@/lib/redis-client";
import { parseStack, type ToolId } from "@/lib/stack";
import type { PushSubscription } from "web-push";

const KEY_PREFIX = "push:sub:";
const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export type PushRecord = {
  endpoint: string;
  keys: PushSubscription["keys"];
  expirationTime?: number | null;
  /** The visitor's stack while alerts are on. Absent = every alert. */
  tools?: ToolId[];
  /** ISO time of the last write. Informational. */
  updatedAt?: string;
};

/** The subset web-push needs. Never hand it the whole record. */
export function toWebPushSubscription(r: PushRecord): PushSubscription {
  const sub: PushSubscription = { endpoint: r.endpoint, keys: r.keys };
  if (r.expirationTime !== undefined) sub.expirationTime = r.expirationTime;
  return sub;
}

/** Build the value to store. `tools` null/empty means "everything" and is not written. */
export function toRecord(sub: PushSubscription, tools: readonly ToolId[] | null, now = new Date()): PushRecord {
  const rec: PushRecord = { endpoint: sub.endpoint, keys: sub.keys, updatedAt: now.toISOString() };
  if (sub.expirationTime !== undefined) rec.expirationTime = sub.expirationTime;
  const clean = tools && tools.length ? parseStack(JSON.stringify(tools)) : null;
  if (clean) rec.tools = clean;
  return rec;
}

/** Parse a stored value; null when it is not a usable record. Unknown tool ids are dropped. */
export function fromStored(v: unknown): PushRecord | null {
  let obj: unknown = v;
  if (typeof v === "string") {
    try {
      obj = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const keys = o.keys as Record<string, unknown> | undefined;
  if (typeof o.endpoint !== "string" || !keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  const rec: PushRecord = { endpoint: o.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
  if (o.expirationTime === null || typeof o.expirationTime === "number") rec.expirationTime = o.expirationTime;
  if (typeof o.updatedAt === "string") rec.updatedAt = o.updatedAt;
  if (Array.isArray(o.tools)) {
    const clean = parseStack(JSON.stringify(o.tools));
    if (clean) rec.tools = clean;
  }
  return rec;
}

function loadRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return createRedis(url, token);
}

async function hashEndpoint(endpoint: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(endpoint);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Write (or overwrite) the record for this endpoint. `set` replaces the
 * whole value, so a write with no tools clears an earlier scope.
 */
export async function savePushSubscription(
  sub: PushSubscription,
  tools: readonly ToolId[] | null = null,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const redis = loadRedis();
  if (!redis) return { ok: false, error: "redis_unavailable" };

  const id = await hashEndpoint(sub.endpoint);
  const key = `${KEY_PREFIX}${id}`;
  await redis.set(key, JSON.stringify(toRecord(sub, tools)), { ex: TTL_SECONDS });
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

export async function getAllPushRecords(): Promise<PushRecord[]> {
  const redis = loadRedis();
  if (!redis) return [];

  const records: PushRecord[] = [];
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
        const rec = fromStored(v);
        if (rec) records.push(rec); // malformed values are skipped
      }
    }
  } while (cursor !== 0);

  return records;
}
