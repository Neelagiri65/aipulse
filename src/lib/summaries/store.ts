/**
 * Where machine summaries live: one Redis key per item, and a per-day counter for the cap.
 * Absent Redis → nothing is read or written (and nothing is generated: the cap cannot be kept).
 */

import type { Redis } from "@upstash/redis";
import { createRedis } from "@/lib/redis-client";
import type { MachineSummary } from "@/lib/summaries/machine-summary";

const KEY_PREFIX = "msum:";
const COUNT_PREFIX = "msum:count:";
const FAIL_PREFIX = "msum:fail:";
const ATTEMPT_PREFIX = "msum:attempts:";
/** One record for the model itself: answered or not, across every item and run. */
const MODEL_HEALTH_KEY = "msum:model";
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

/** Founder's 2026-09-26 cap counts successes (timeouts must not spend the allowance). This is a
 *  separate ceiling on ATTEMPTS, so a bad day for the endpoint cannot turn into hundreds of calls.
 *  Per-item backoff keeps a normal day far below it. */
export const MACHINE_SUMMARY_ATTEMPTS_PER_DAY = 200;

/** The last failed attempt for one item. Kept so the next run does not repeat it blindly. */
export type MachineSummaryFailure = {
  reason: string;
  /** Failed attempts so far for this item. */
  attempts: number;
  lastAt: string;
  /** Article text hash at the failure, when the page was read. */
  inputHash?: string;
  /** Operator-only: HTTP status + body excerpt, error name, or the rejected answer. */
  detail?: string;
};

/**
 * Whether the model answers. Added 2026-11-06: openai/gpt-oss-20b timed out on every call for at
 * least a week (last summary 10-29) and nothing surfaced it, because each item's failures were
 * counted alone. A streak across items is what /api/integrity pages on.
 * "Answered" includes an answer the grounding check rejected: the model worked; the article did not.
 * Page failures (fetch, blocked, too-short) never touch this record.
 */
export type ModelHealth = {
  /** Model calls in a row that got no answer (timeout, HTTP error, dropped connection). */
  failStreak: number;
  lastOkAt: string | null;
  lastFailAt: string | null;
};

export function nextModelHealth(prev: ModelHealth | null, ok: boolean, at: string): ModelHealth {
  const base: ModelHealth = prev ?? { failStreak: 0, lastOkAt: null, lastFailAt: null };
  return ok
    ? { ...base, failStreak: 0, lastOkAt: at }
    : { ...base, failStreak: base.failStreak + 1, lastFailAt: at };
}

export type MachineSummaryStore = {
  available(): boolean;
  read(keys: string[]): Promise<Map<string, MachineSummary>>;
  write(key: string, summary: MachineSummary): Promise<void>;
  /** Summaries written today. The cap counts SUCCESSES: on a bad hour for the free endpoint,
   *  timeouts must not spend the day's allowance (smoke run 2026-09-26: 7 of 8 timed out). */
  spent(day: string): Promise<number>;
  /** Records one written summary against today's cap. */
  claim(day: string): Promise<boolean>;
  readFailures(keys: string[]): Promise<Map<string, MachineSummaryFailure>>;
  writeFailure(key: string, failure: MachineSummaryFailure): Promise<void>;
  /** Attempts made today (every call to the summariser, success or not). */
  attempted(day: string): Promise<number>;
  countAttempt(day: string): Promise<void>;
  /** Throws when Redis cannot be read: "could not look" must not read as "healthy". */
  readModelHealth(): Promise<ModelHealth | null>;
  recordModel(ok: boolean, at: string): Promise<void>;
};

function parseModelHealth(v: unknown): ModelHealth | null {
  const parsed = typeof v === "string" ? (JSON.parse(v) as ModelHealth) : (v as ModelHealth | null);
  return parsed && typeof parsed.failStreak === "number" ? parsed : null;
}

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
  async spent(day) {
    const r = redis();
    if (!r) return MACHINE_SUMMARIES_PER_DAY;
    const n = Number(await r.get(COUNT_PREFIX + day));
    return Number.isFinite(n) ? n : 0;
  },
  async claim(day) {
    const r = redis();
    if (!r) return false;
    const n = await r.incr(COUNT_PREFIX + day);
    if (n === 1) await r.expire(COUNT_PREFIX + day, COUNT_TTL_SECONDS);
    return n <= MACHINE_SUMMARIES_PER_DAY;
  },
  async readFailures(keys) {
    const r = redis();
    const out = new Map<string, MachineSummaryFailure>();
    if (!r || keys.length === 0) return out;
    // Not caught: a failed read must not look like "no failures" and re-run every item.
    const values = await r.mget<(MachineSummaryFailure | string | null)[]>(...keys.map((k) => FAIL_PREFIX + k));
    values.forEach((v, i) => {
      const parsed = typeof v === "string" ? (JSON.parse(v) as MachineSummaryFailure) : v;
      if (parsed && typeof parsed.reason === "string") out.set(keys[i], parsed);
    });
    return out;
  },
  async writeFailure(key, failure) {
    const r = redis();
    if (!r) return;
    await r.set(FAIL_PREFIX + key, JSON.stringify(failure), { ex: SUMMARY_TTL_SECONDS });
  },
  async attempted(day) {
    const r = redis();
    if (!r) return MACHINE_SUMMARY_ATTEMPTS_PER_DAY;
    const n = Number(await r.get(ATTEMPT_PREFIX + day));
    return Number.isFinite(n) ? n : 0;
  },
  async countAttempt(day) {
    const r = redis();
    if (!r) return;
    const n = await r.incr(ATTEMPT_PREFIX + day);
    if (n === 1) await r.expire(ATTEMPT_PREFIX + day, COUNT_TTL_SECONDS);
  },
  async readModelHealth() {
    const r = redis();
    if (!r) return null;
    return parseModelHealth(await r.get(MODEL_HEALTH_KEY));
  },
  async recordModel(ok, at) {
    const r = redis();
    if (!r) return;
    // Read-modify-write is safe: wire-ingest-hn runs one at a time (workflow concurrency group).
    const prev = parseModelHealth(await r.get(MODEL_HEALTH_KEY));
    await r.set(MODEL_HEALTH_KEY, JSON.stringify(nextModelHealth(prev, ok, at)));
  },
};
