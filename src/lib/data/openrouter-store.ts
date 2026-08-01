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
 * Reads are fail-soft (null/empty) — the panel renders a gap. Writes
 * REPORT their outcome instead of swallowing: a rejected write means
 * the panel serves a stale DTO and the sparkline loses a day while the
 * cron stays green (the 2026-07 Upstash incident failure class). The
 * ingest runner folds these outcomes into its ok so the workflow layer
 * can go red.
 */

import { Redis } from "@upstash/redis";

import type {
  ModelUsageDto,
  ModelUsageSnapshotRow,
} from "@/lib/data/openrouter-types";

export const RANKINGS_LATEST_KEY = "openrouter:rankings:latest";
export const SNAPSHOTS_KEY = "openrouter:snapshots";

export type OpenRouterWriteResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Outcome of the idempotent daily-snapshot append. Three distinct
 * states that used to collapse into one boolean:
 *   { wrote: true }                — the field landed this call.
 *   { wrote: false }               — already present; skipped to
 *                                    preserve idempotency. Fine.
 *   { wrote: false, error: "..." } — Redis unconfigured or the command
 *                                    was rejected. NOT fine — the day's
 *                                    snapshot is missing.
 */
export type SnapshotAppendResult = { wrote: boolean; error?: string };

export type OpenRouterStore = {
  writeRankingsLatest(dto: ModelUsageDto): Promise<OpenRouterWriteResult>;
  readRankingsLatest(): Promise<ModelUsageDto | null>;
  /** Append today's snapshot under field=date. See SnapshotAppendResult. */
  writeDailySnapshotIfAbsent(
    date: string,
    snapshot: ModelUsageSnapshotRow,
  ): Promise<SnapshotAppendResult>;
  /**
   * All snapshot rows keyed by ISO date. Returns an empty record
   * when the hash is missing or Upstash is unavailable.
   */
  readSnapshots(): Promise<Record<string, ModelUsageSnapshotRow>>;
};

/** Minimal client surface the writes need — lets tests inject a fake. */
export type OpenRouterWriteClient = {
  set: (key: string, value: string) => Promise<unknown>;
  hget: (key: string, field: string) => Promise<unknown>;
  hset: (key: string, fields: Record<string, string>) => Promise<unknown>;
};

/** Write the live DTO. Exported standalone (client-injectable) so the
 *  error mapping is unit-testable without a Redis instance. */
export async function writeRankingsLatestWith(
  client: OpenRouterWriteClient | null,
  dto: ModelUsageDto,
): Promise<OpenRouterWriteResult> {
  if (!client) return { ok: false, message: "redis not configured" };
  try {
    await client.set(RANKINGS_LATEST_KEY, JSON.stringify(dto));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Idempotent daily-snapshot append. See SnapshotAppendResult for the
 *  three outcomes. Exported standalone for the same reason as above. */
export async function writeDailySnapshotIfAbsentWith(
  client: OpenRouterWriteClient | null,
  date: string,
  snapshot: ModelUsageSnapshotRow,
): Promise<SnapshotAppendResult> {
  if (!client) return { wrote: false, error: "redis not configured" };
  try {
    const existing = await client.hget(SNAPSHOTS_KEY, date);
    if (existing !== null && existing !== undefined) return { wrote: false };
    await client.hset(SNAPSHOTS_KEY, { [date]: JSON.stringify(snapshot) });
    return { wrote: true };
  } catch (e) {
    return {
      wrote: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

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
    return writeRankingsLatestWith(redis(), dto);
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
    return writeDailySnapshotIfAbsentWith(redis(), date, snapshot);
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
