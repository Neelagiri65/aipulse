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

/**
 * Per-package metric bag. Every field is optional — each registry populates
 * whatever windows its upstream natively exposes:
 *   - PyPI (pypistats):   {lastDay, lastWeek, lastMonth}
 *   - npm:                {lastDay, lastWeek, lastMonth}
 *   - crates.io:          {last90d, allTime}
 *   - Docker Hub:         {allTime, stars}
 *   - Homebrew:           {lastMonth, last90d, lastYear}
 * We never synthesise a window the source doesn't give us (a 7d count
 * divided from a 90d window is a lie). Readers surface "—" for missing
 * fields; day-over-day diffs from the daily snapshot ZSET reconstruct
 * arbitrary windows over time.
 */
export type PackageCounter = {
  lastDay?: number;
  lastWeek?: number;
  lastMonth?: number;
  last90d?: number;
  lastYear?: number;
  allTime?: number;
  stars?: number;
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
  /**
   * Packages whose counter in `counters` is a LAST-KNOWN value carried over
   * from an earlier run, keyed to the ISO timestamp it was actually fetched.
   *
   * Absent or empty means every counter in the blob was measured at
   * `fetchedAt`. A reader that shows a carried number must show this age
   * beside it; the daily snapshot must skip it entirely (see
   * `summarisePackageLatest`) because a carried value is not a measurement of
   * today.
   */
  carried?: Record<string, string>;
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

/**
 * Write the "latest" blob, carrying forward the last-known counter for any
 * package that FAILED this run. Never throws.
 *
 * This used to be a plain overwrite, and the overwrite was destroying data.
 * pypistats.org rate-limits; a refused package was simply absent from the new
 * blob, so its previously-known counter was erased. The daily snapshot then
 * read a blob with no row for it, and the hole in the 30-day series was
 * permanent. Measured on prod: PyPI packages held 10-21 of 30 days —
 * `pypi:anthropic`'s newest figure was nine days old — while npm, crates,
 * docker, brew and vscode, whose upstreams do not rate-limit, all held 29.
 *
 * Only packages named in THIS run's `failures` are carried. A package that
 * was deliberately dropped from a tracked list is not in `failures`, so it
 * falls out of the blob as intended rather than being resurrected forever.
 *
 * A carried counter is explicitly NOT presented as a fresh measurement: it is
 * listed in `carried` with the timestamp it was really fetched, so a display
 * can age it honestly and the snapshot can leave the day empty.
 */
export async function writeLatest(latest: PackageLatest): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    const merged = carryForwardFailed(latest, await readLatest(latest.source));
    await r.set(latestKey(merged.source), JSON.stringify(merged));
  } catch {
    // observability must not break the pipeline it observes
  }
}

/** Pure merge step — no I/O, so the branching is directly testable. */
export function carryForwardFailed(
  next: PackageLatest,
  previous: PackageLatest | null,
): PackageLatest {
  const failedPkgs = next.failures.map((f) => f.pkg);
  if (failedPkgs.length === 0) return next;
  if (!previous) return next;

  const counters = { ...next.counters };
  const carried: Record<string, string> = {};

  for (const pkg of failedPkgs) {
    if (counters[pkg] !== undefined) continue; // it succeeded after all
    const known = previous.counters[pkg];
    if (known === undefined) continue; // never had a value to keep
    counters[pkg] = known;
    // Preserve the ORIGINAL fetch time, not the previous blob's, so the age
    // does not reset every time a package fails again.
    carried[pkg] = previous.carried?.[pkg] ?? previous.fetchedAt;
  }

  if (Object.keys(carried).length === 0) return next;
  return { ...next, counters, carried };
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
