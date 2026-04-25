/**
 * Redis-backed store for the OpenRouter Model Usage panel.
 *
 * Two keys:
 *   - openrouter:rankings:latest    SET (JSON), no TTL.
 *     The live ModelUsageDto, overwritten on every cron fire so the
 *     panel API can serve the freshest reading without re-fetching
 *     OpenRouter on every page load.
 *   - openrouter:snapshots          HASH, no TTL.
 *     Field = UTC YYYY-MM-DD, value = JSON({slugs, ordering}).
 *     One field per UTC day; once written the field stays. Powers
 *     the drawer's 30d rank-history sparkline + the digest's
 *     "biggest mover this week" computation.
 *
 * Idempotency contract: writeDailySnapshotIfAbsent is the only safe
 * way to append a snapshot. It HEXISTS-checks then HSETs only when
 * the field is absent — sequential GH Actions cron runs do not race
 * (they run one at a time on the runner pool), but the explicit check
 * makes the intent legible and protects against a future migration
 * to a parallel scheduler.
 *
 * Graceful absence: if Upstash env vars are unset (dev / preview),
 * every read returns null/empty and every write becomes a no-op so
 * the calling cron route can still complete cleanly.
 */

import { Redis } from "@upstash/redis";

import type {
  ModelUsageDto,
  ModelUsageSnapshotRow,
} from "@/lib/data/openrouter-types";

export const RANKINGS_LATEST_KEY = "openrouter:rankings:latest";
export const SNAPSHOTS_KEY = "openrouter:snapshots";

export type OpenRouterStore = {
  writeRankingsLatest(dto: ModelUsageDto): Promise<void>;
  readRankingsLatest(): Promise<ModelUsageDto | null>;
  /**
   * Append today's snapshot under field=date. Returns true if it
   * actually wrote (date was absent), false if the field was already
   * present and we skipped to preserve idempotency.
   */
  writeDailySnapshotIfAbsent(
    date: string,
    snapshot: ModelUsageSnapshotRow,
  ): Promise<boolean>;
  /**
   * All snapshot rows keyed by ISO date. Returns an empty record
   * when the hash is missing or Upstash is unavailable.
   */
  readSnapshots(): Promise<Record<string, ModelUsageSnapshotRow>>;
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

export const redisOpenRouterStore: OpenRouterStore = {
  async writeRankingsLatest(dto) {
    const r = redis();
    if (!r) return;
    try {
      await r.set(RANKINGS_LATEST_KEY, JSON.stringify(dto));
    } catch {
      // observability must not break the thing it observes
    }
  },

  async readRankingsLatest() {
    const r = redis();
    if (!r) return null;
    try {
      const raw = await r.get(RANKINGS_LATEST_KEY);
      return parseDto(raw);
    } catch {
      return null;
    }
  },

  async writeDailySnapshotIfAbsent(date, snapshot) {
    const r = redis();
    if (!r) return false;
    try {
      const existing = await r.hget(SNAPSHOTS_KEY, date);
      if (existing !== null && existing !== undefined) return false;
      await r.hset(SNAPSHOTS_KEY, { [date]: JSON.stringify(snapshot) });
      return true;
    } catch {
      return false;
    }
  },

  async readSnapshots() {
    const r = redis();
    if (!r) return {};
    try {
      const raw = (await r.hgetall<Record<string, unknown>>(SNAPSHOTS_KEY)) ?? {};
      const out: Record<string, ModelUsageSnapshotRow> = {};
      for (const [date, value] of Object.entries(raw)) {
        const parsed = parseSnapshotRow(value);
        if (parsed) out[date] = parsed;
      }
      return out;
    } catch {
      return {};
    }
  },
};

function parseDto(raw: unknown): ModelUsageDto | null {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return null;
    return obj as ModelUsageDto;
  } catch {
    return null;
  }
}

function parseSnapshotRow(raw: unknown): ModelUsageSnapshotRow | null {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.date !== "string") return null;
    if (!Array.isArray(o.slugs)) return null;
    return obj as ModelUsageSnapshotRow;
  } catch {
    return null;
  }
}

/**
 * Format today's UTC date as YYYY-MM-DD. Hoisted so the cron route +
 * tests share the same string format and we don't drift to local TZ
 * by accident.
 */
export function utcDate(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
