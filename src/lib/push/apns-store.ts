/**
 * APNs device-token storage in Upstash Redis.
 *
 * One HASH per APNs environment — `apns:tokens:sandbox` (Xcode debug builds)
 * and `apns:tokens:production` (TestFlight + App Store) — field = the hex
 * device token (length is Apple's to choose), value = `{ tools, addedAt }`. A hash dedupes for free and
 * costs ONE command per alert (HGETALL) where per-token keys would SCAN.
 * Budget: 1 HSET per install, 1 HDEL per unsubscribe, 1 HGETALL per alert.
 *
 * Environment is stored on the record because a token sent to the wrong
 * gateway is `BadDeviceToken`, which the sender then deletes — every push
 * would silently vanish. The app says which build it is; the server never
 * guesses from a global.
 *
 * `tools` mirrors the web-push record (`store.ts`): null = every alert, a
 * list = only those tools (see `target.ts`).
 */
import { createRedis } from "@/lib/redis-client";
import { parseStack, type ToolId } from "@/lib/stack";

export const APNS_ENVS = ["sandbox", "production"] as const;
export type ApnsEnv = (typeof APNS_ENVS)[number];

export type ApnsRecord = {
  token: string;
  env: ApnsEnv;
  tools: ToolId[] | null;
  addedAt: string;
};

// Apple: "the length of the device token may change in the future — do not
// hardcode it." It did: a 2026 simulator on Apple silicon hands over 80 bytes
// (160 hex), where devices have long given 32. Lowercase hex, even length,
// bounded — never a fixed 64.
const TOKEN_RE = /^(?:[0-9a-f]{2}){16,128}$/;

export function isApnsToken(v: unknown): v is string {
  return typeof v === "string" && TOKEN_RE.test(v);
}

export function isApnsEnv(v: unknown): v is ApnsEnv {
  return typeof v === "string" && (APNS_ENVS as readonly string[]).includes(v);
}

export function hashKey(env: ApnsEnv): string {
  return `apns:tokens:${env}`;
}

/** What one hash field holds. `tools` is validated like the web record. */
export function toStoredValue(tools: readonly ToolId[] | null, now = new Date()): string {
  const scoped = tools && tools.length > 0 ? parseStack(JSON.stringify(tools)) : null;
  return JSON.stringify({ tools: scoped && scoped.length > 0 ? scoped : null, addedAt: now.toISOString() });
}

/** Parse one hash entry. Malformed values yield null and are skipped, never crash a broadcast. */
export function fromStoredValue(token: string, env: ApnsEnv, v: unknown): ApnsRecord | null {
  if (!isApnsToken(token)) return null;
  let parsed: unknown = v;
  if (typeof v === "string") {
    try {
      parsed = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as { tools?: unknown; addedAt?: unknown };
  const tools = Array.isArray(o.tools) ? parseStack(JSON.stringify(o.tools)) : null;
  return {
    token,
    env,
    tools: tools && tools.length > 0 ? tools : null,
    addedAt: typeof o.addedAt === "string" ? o.addedAt : "",
  };
}

type RedisLike = {
  hset: (key: string, fields: Record<string, string>) => Promise<unknown>;
  hdel: (key: string, ...fields: string[]) => Promise<unknown>;
  hgetall: (key: string) => Promise<Record<string, unknown> | null>;
};

function loadRedis(): RedisLike | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return createRedis(url, token) as unknown as RedisLike;
}

export async function saveApnsToken(
  token: string,
  env: ApnsEnv,
  tools: readonly ToolId[] | null = null,
  redis: RedisLike | null = loadRedis(),
): Promise<{ ok: boolean; error?: string }> {
  if (!redis) return { ok: false, error: "redis_unavailable" };
  await redis.hset(hashKey(env), { [token]: toStoredValue(tools) });
  return { ok: true };
}

export async function removeApnsToken(
  token: string,
  env: ApnsEnv,
  redis: RedisLike | null = loadRedis(),
): Promise<{ ok: boolean }> {
  if (!redis) return { ok: false };
  await redis.hdel(hashKey(env), token);
  return { ok: true };
}

/** Every token for one environment: ONE command. */
export async function getApnsRecords(
  env: ApnsEnv,
  redis: RedisLike | null = loadRedis(),
): Promise<ApnsRecord[]> {
  if (!redis) return [];
  const all = await redis.hgetall(hashKey(env));
  if (!all) return [];
  const out: ApnsRecord[] = [];
  for (const [token, v] of Object.entries(all)) {
    const r = fromStoredValue(token, env, v);
    if (r) out.push(r);
  }
  return out;
}
