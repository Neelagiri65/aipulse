/**
 * Cron health monitor — silent-failure detector for the scheduled
 * ingest jobs. Each route writes a record on both success and failure
 * so /api/cron-health can surface "this cron hasn't run in 2× its
 * expected interval" in the StatusBar without tailing GH Actions logs.
 *
 * Design:
 *   - One Redis key per workflow (`cron:health:{workflow}`). No TTL —
 *     we want stale crons to show as stale, not vanish.
 *   - writeCronHealth is non-blocking by contract: if Redis is down
 *     or the write throws, ingest still succeeds. Health recording
 *     must never take down the pipeline it observes.
 *   - CRON_WORKFLOWS is the single source of truth for which crons
 *     are monitored and what their expected interval is. Adding a
 *     cron here is what makes it show up in the StatusBar chip.
 *   - Two wiring shapes exist: (1) routes that call writeCronHealth
 *     directly after their runIngest — the default for the 7
 *     Vercel-round-trip ingest endpoints; (2) workflows that can't
 *     call writeCronHealth in-process (benchmarks-ingest runs a script
 *     on the Actions runner; labs-cron is a read-side cache warmer)
 *     use /api/cron-health/record to post their outcome.
 */

import { Redis } from "@upstash/redis";

const KEY_PREFIX = "cron:health:";

/**
 * Monitored cron workflows. Keys match the workflow file stem
 * (.github/workflows/{key}.yml) so they read naturally in logs.
 * Intervals are the `schedule: - cron:` cadence of that workflow.
 */
export const CRON_WORKFLOWS = {
  "globe-ingest": { expectedIntervalMinutes: 5 },
  "wire-ingest-hn": { expectedIntervalMinutes: 15 },
  "wire-ingest-rss": { expectedIntervalMinutes: 30 },
  "registry-backfill-events": { expectedIntervalMinutes: 60 },
  "registry-discover-topics": { expectedIntervalMinutes: 120 },
  "registry-discover": { expectedIntervalMinutes: 360 },
  "registry-discover-deps": { expectedIntervalMinutes: 360 },
  "labs-cron": { expectedIntervalMinutes: 360 },
  "benchmarks-ingest": { expectedIntervalMinutes: 1440 },
} as const;

export type CronWorkflowName = keyof typeof CRON_WORKFLOWS;

export type CronHealthRecord = {
  workflow: CronWorkflowName;
  /** ISO of the most recent run that returned ok:true. */
  lastSuccessAt: string | null;
  /** ISO of the most recent run that returned ok:false or threw. */
  lastFailureAt: string | null;
  /** Error message from the most recent failure. Null once a success
   *  follows a failure? No — we preserve it as audit trail so you can
   *  see the last known problem even after recovery. */
  lastError: string | null;
  /** Items written by the most recent successful run. Signal that
   *  the cron is not just "returning 200 with an empty payload". */
  itemsProcessed: number;
  /** Cumulative failure counter across the life of this workflow.
   *  Never decrements. Useful for "this cron fails once a week" vs
   *  "this cron has been failing for 2 days". */
  errorCount: number;
  /** Declared cadence (minutes). Mirrors CRON_WORKFLOWS at write time
   *  so a reader can judge staleness without another lookup. */
  expectedIntervalMinutes: number;
  /** ISO of this write (success or failure). */
  updatedAt: string;
};

export type CronHealthOutcome =
  | { ok: true; itemsProcessed: number }
  | { ok: false; error: string };

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

export function isCronHealthAvailable(): boolean {
  return redis() !== null;
}

/**
 * Record the outcome of a cron run. Must never throw — if Redis is
 * unavailable we swallow the error; the ingest route's own success
 * path is what the user sees.
 */
export async function writeCronHealth(
  workflow: CronWorkflowName,
  outcome: CronHealthOutcome,
): Promise<void> {
  const r = redis();
  if (!r) return;
  const key = `${KEY_PREFIX}${workflow}`;
  const expected = CRON_WORKFLOWS[workflow].expectedIntervalMinutes;
  try {
    const existing = await r.get(key);
    const prev = parseRecord(existing);
    const now = new Date().toISOString();
    const record: CronHealthRecord = {
      workflow,
      lastSuccessAt: outcome.ok ? now : (prev?.lastSuccessAt ?? null),
      lastFailureAt: outcome.ok ? (prev?.lastFailureAt ?? null) : now,
      lastError: outcome.ok ? (prev?.lastError ?? null) : outcome.error,
      itemsProcessed: outcome.ok
        ? outcome.itemsProcessed
        : (prev?.itemsProcessed ?? 0),
      errorCount: (prev?.errorCount ?? 0) + (outcome.ok ? 0 : 1),
      expectedIntervalMinutes: expected,
      updatedAt: now,
    };
    await r.set(key, JSON.stringify(record));
  } catch {
    // never propagate — observability must not break the thing it observes.
  }
}

/**
 * Read every monitored workflow's current health record. Absent
 * records (cron has never run yet) are returned as bare placeholders
 * so the StatusBar can show "never run" rather than silently hiding.
 */
export async function readAllCronHealth(): Promise<CronHealthRecord[]> {
  const workflows = Object.keys(CRON_WORKFLOWS) as CronWorkflowName[];
  const r = redis();
  if (!r) {
    return workflows.map((w) => placeholderRecord(w));
  }
  const keys = workflows.map((w) => `${KEY_PREFIX}${w}`);
  try {
    const values = (await r.mget(...keys)) as unknown[];
    return workflows.map((w, i) => {
      const parsed = parseRecord(values[i]);
      return parsed ?? placeholderRecord(w);
    });
  } catch {
    return workflows.map((w) => placeholderRecord(w));
  }
}

/**
 * A cron is stale if its most recent success is older than 2× its
 * declared interval, or if it has never succeeded at all. 2× is the
 * standard "we missed one tick and the next one too" gate — tight
 * enough to catch real failures, loose enough to tolerate a single
 * transient blip without crying wolf.
 */
export function isCronStale(
  record: CronHealthRecord,
  now: number = Date.now(),
): boolean {
  if (!record.lastSuccessAt) return true;
  const lastMs = Date.parse(record.lastSuccessAt);
  if (Number.isNaN(lastMs)) return true;
  const staleAfterMs = record.expectedIntervalMinutes * 2 * 60 * 1000;
  return now - lastMs > staleAfterMs;
}

function parseRecord(value: unknown): CronHealthRecord | null {
  if (!value) return null;
  try {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.workflow !== "string") return null;
    if (!(o.workflow in CRON_WORKFLOWS)) return null;
    return obj as CronHealthRecord;
  } catch {
    return null;
  }
}

function placeholderRecord(workflow: CronWorkflowName): CronHealthRecord {
  return {
    workflow,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    itemsProcessed: 0,
    errorCount: 0,
    expectedIntervalMinutes: CRON_WORKFLOWS[workflow].expectedIntervalMinutes,
    updatedAt: new Date(0).toISOString(),
  };
}
