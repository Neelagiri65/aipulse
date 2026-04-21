/**
 * Package-registry "latest counters" store — narrow Redis helpers for
 * adoption signals that come out as single numbers (downloads per day /
 * week / month, Docker pulls, Homebrew installs) rather than per-event
 * streams.
 *
 * Shape:
 *   pkg:{source}:latest   SET (JSON), no TTL. One blob per source,
 *                         overwritten on every ingest. Carries the
 *                         rolling counters for each tracked package.
 *
 * Why no per-poll history? The daily snapshot at 04:00 UTC already
 * captures today's counters; trend lines read from snapshot history,
 * not from this store. Keeping only "latest" keeps Redis clean and
 * snapshot-read paths obvious.
 *
 * Graceful on Redis absence: every call returns the fail-soft value
 * (null / empty) instead of throwing. Ingest paths write best-effort;
 * callers see "unavailable" if the store is down.
 */

import { Redis } from "@upstash/redis";

const KEY_PREFIX = "pkg:";
const LATEST_SUFFIX = ":latest";

/** Rolling counters published by pypistats.org. Keys mirror the
 *  upstream JSON: {last_day, last_week, last_month}. */
export type PackageCounter = {
  lastDay: number;
  lastWeek: number;
  lastMonth: number;
};

/** One source's latest blob. `source` identifies the registry
 *  (pypi/npm/docker/crates/homebrew); `counters` is keyed by the
 *  package name within that registry. */
export type PackageLatest = {
  source: string;
  fetchedAt: string;
  counters: Record<string, PackageCounter>;
  /** Non-fatal per-package fetch failures so readers can surface gaps
   *  rather than implying zero. */
  failures: Array<{ pkg: string; message: string }>;
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

export function isPkgStoreAvailable(): boolean {
  return redis() !== null;
}

export function latestKey(source: string): string {
  return `${KEY_PREFIX}${source}${LATEST_SUFFIX}`;
}

/** Overwrite the "latest" blob for a source. Never throws. */
export async function writeLatest(latest: PackageLatest): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(latestKey(latest.source), JSON.stringify(latest));
  } catch {
    // observability must not break the pipeline it observes
  }
}

/** Read the "latest" blob for a source. Null if missing or malformed. */
export async function readLatest(
  source: string,
): Promise<PackageLatest | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(latestKey(source));
    return parseLatest(v);
  } catch {
    return null;
  }
}

function parseLatest(value: unknown): PackageLatest | null {
  if (!value) return null;
  try {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.source !== "string" ||
      typeof o.fetchedAt !== "string" ||
      !o.counters ||
      typeof o.counters !== "object"
    ) {
      return null;
    }
    return obj as PackageLatest;
  } catch {
    return null;
  }
}
