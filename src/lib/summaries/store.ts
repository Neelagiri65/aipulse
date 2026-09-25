/**
 * Where machine summaries live: one Redis key per item, and a per-day counter for the cap.
 * Absent Redis → nothing is read or written (and nothing is generated: the cap cannot be kept).
 */

import type { Redis } from "@upstash/redis";
import { createRedis } from "@/lib/redis-client";
import type { MachineSummary } from "@/lib/summaries/machine-summary";

const KEY_PREFIX = "msum:";
const COUNT_PREFIX = "msum:count:";
/** Longer than any card's life in the feed window. */
const SUMMARY_TTL_SECONDS = 7 * 24 * 60 * 60;
const COUNT_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Founder's cap (2026-09-26): 60 new machine summaries per UTC day. */
export const MACHINE_SUMMARIES_PER_DAY = 60;

let cached: Redis | null | undefined;
function redis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? createRedis(url, token) : null;
  return cached;
}

export type MachineSummaryStore = {
  available(): boolean;
  read(keys: string[]): Promise<Map<string, MachineSummary>>;
  write(key: string, summary: MachineSummary): Promise<void>;
  /** Claims one unit of today's budget; false when the day's cap is spent. */
  claim(day: string): Promise<boolean>;
};

export const redisMachineSummaryStore: MachineSummaryStore = {
  available: () => redis() !== null,
  async read(keys) {
    const r = redis();
    const out = new Map<string, MachineSummary>();
    if (!r || keys.length === 0) return out;
    try {
      const values = await r.mget<(MachineSummary | string | null)[]>(...keys.map((k) => KEY_PREFIX + k));
      values.forEach((v, i) => {
        const parsed = typeof v === "string" ? (JSON.parse(v) as MachineSummary) : v;
        if (parsed && typeof parsed.text === "string" && parsed.text) out.set(keys[i], parsed);
      });
    } catch {
      // A failed read shows no machine summary — never a stale or partial one.
    }
    return out;
  },
  async write(key, summary) {
    const r = redis();
    if (!r) return;
    await r.set(KEY_PREFIX + key, JSON.stringify(summary), { ex: SUMMARY_TTL_SECONDS });
  },
  async claim(day) {
    const r = redis();
    if (!r) return false;
    const n = await r.incr(COUNT_PREFIX + day);
    if (n === 1) await r.expire(COUNT_PREFIX + day, COUNT_TTL_SECONDS);
    return n <= MACHINE_SUMMARIES_PER_DAY;
  },
};
