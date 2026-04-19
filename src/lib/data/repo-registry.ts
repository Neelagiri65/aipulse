/**
 * Repo registry — persistent list of public GitHub repos where at least one
 * AI-tool config file has been *verified* (file exists AND first 500 bytes
 * look config-shaped, not a placeholder or template stub).
 *
 * Motivation: the globe currently shows *live activity* (last 240 min) only.
 * When a Push/PR/Issue event happens in a repo with AI config, that repo's
 * dot lights up teal. But a repo that hasn't pushed in 10 days falls off the
 * globe entirely — even though its AI-config story is still true. The
 * registry is the long-term memory layer: 2k+ verified repos with decay-
 * coded "last activity" signals so the map can render the full ecosystem,
 * not just the last-4-hour slice.
 *
 * Storage:
 *   - Single HASH keyed by full_name ("owner/name") → JSON blob. One HSET
 *     batch per discovery run (1 command regardless of batch size on
 *     Upstash). One HGETALL per read (also 1 command).
 *   - Meta in a separate STRING key (discovery stats, failures).
 *   - 14-day TTL — if no discovery has landed for two weeks the data is
 *     stale enough to expire and the UI correctly reflects "registry not
 *     maintained" via the meta block.
 *
 * Command budget (Upstash free tier, 10k/day):
 *   - Discovery cron every 6h: 4 HSET + 4 SET meta = 8 commands/day.
 *   - Reads: 1 HGETALL per UI poll. At 60s poll cadence × 3 clients avg
 *     that's ~4k reads/day. Comfortably inside budget alongside the
 *     existing globe-store's ~4k commands/day.
 *
 * Graceful degradation:
 *   - When Redis is unconfigured, every function is a silent no-op and
 *     readers return empty. The globe falls back to live-activity only;
 *     nothing crashes, nothing fabricates.
 *
 * Trust contract:
 *   - `configs[i].sample` is a verbatim first-500-bytes quote of the file
 *     that made this repo qualify. It's kept so the /archives page (future)
 *     can show "this is WHY we counted it" — no scoring opacity.
 *   - `lastActivity` comes straight from the GitHub API's `pushed_at` — we
 *     never synthesise activity.
 */

import { Redis } from "@upstash/redis";

// Types + pure helpers are defined in `registry-shared.ts` so client
// components can import them without pulling in the Upstash SDK. This
// module adds the Redis-backed read/write path on top.
export {
  CONFIG_PATHS,
  decayScore,
  formatAgeLabel,
  type ConfigKind,
  type DetectedConfig,
  type RegistryEntry,
  type RegistryLocation,
  type RegistryMeta,
} from "./registry-shared";

import type {
  RegistryEntry,
  RegistryMeta,
} from "./registry-shared";

const ENTRIES_KEY = "aipulse:registry:entries";
const META_KEY = "aipulse:registry:meta";
const KEY_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

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

export function isRegistryAvailable(): boolean {
  return redis() !== null;
}

/**
 * Upsert a batch of entries. Single HSET call — Upstash counts this as one
 * command regardless of field count, so a 2k-entry seed costs exactly 2
 * commands (HSET + EXPIRE).
 */
export async function upsertEntries(entries: RegistryEntry[]): Promise<void> {
  const r = redis();
  if (!r || entries.length === 0) return;
  const payload: Record<string, string> = {};
  for (const e of entries) payload[e.fullName] = JSON.stringify(e);
  try {
    await r.hset(ENTRIES_KEY, payload);
    await r.expire(ENTRIES_KEY, KEY_TTL_SECONDS);
  } catch {
    // Swallow — discovery retries on the next cron tick.
  }
}

export async function readAllEntries(): Promise<RegistryEntry[]> {
  const r = redis();
  if (!r) return [];
  try {
    const all = await r.hgetall<Record<string, unknown>>(ENTRIES_KEY);
    if (!all) return [];
    const out: RegistryEntry[] = [];
    for (const v of Object.values(all)) {
      const parsed = parseEntry(v);
      if (parsed) out.push(parsed);
    }
    return out;
  } catch {
    return [];
  }
}

export async function readEntry(
  fullName: string,
): Promise<RegistryEntry | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.hget(ENTRIES_KEY, fullName);
    return parseEntry(v);
  } catch {
    return null;
  }
}

export async function removeEntries(fullNames: string[]): Promise<void> {
  const r = redis();
  if (!r || fullNames.length === 0) return;
  try {
    await r.hdel(ENTRIES_KEY, ...fullNames);
  } catch {
    // no-op
  }
}

export async function writeMeta(meta: RegistryMeta): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(META_KEY, JSON.stringify(meta), { ex: KEY_TTL_SECONDS });
  } catch {
    // no-op
  }
}

export async function readMeta(): Promise<RegistryMeta | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(META_KEY);
    if (!v) return null;
    if (typeof v === "string") return JSON.parse(v) as RegistryMeta;
    if (typeof v === "object") return v as RegistryMeta;
    return null;
  } catch {
    return null;
  }
}

function parseEntry(raw: unknown): RegistryEntry | null {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.fullName !== "string") return null;
    if (!Array.isArray(o.configs)) return null;
    return obj as RegistryEntry;
  } catch {
    return null;
  }
}

// decayScore + formatAgeLabel live in `registry-shared.ts` and are
// re-exported from the top of this file so client code can import them
// without pulling in the Upstash SDK.
