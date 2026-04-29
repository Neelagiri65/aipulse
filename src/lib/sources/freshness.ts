/**
 * Resolve runtime freshness for the public Sources inventory.
 *
 * Each `InventoryEntry` declares HOW it proves freshness (cron success
 * timestamp / last-known cache write / on-demand). This module reads
 * the matching backing store at request time and produces a uniform
 * `ResolvedFreshness` value the UI can render.
 *
 * Pure-ish: takes the cron-health record set + a function that resolves
 * `feed:lk:{key}` write timestamps so the lookup layer is injectable
 * for tests and stays separate from the page rendering.
 */

import type { CronHealthRecord } from "@/lib/data/cron-health";
import type { FreshnessSource, InventoryEntry } from "./inventory";

export type FreshnessTone = "live" | "stale" | "on-demand" | "unknown";

export type ResolvedFreshness = {
  tone: FreshnessTone;
  /** ISO timestamp of the last successful poll/fetch. Null when unknown / on-demand. */
  lastSeenAt: string | null;
  /**
   * Optional human-readable hint shown when the entry can't show a
   * timestamp (e.g. "Fetched per request" for on-demand sources).
   */
  note?: string;
};

export type LastKnownLookup = (key: string) => string | null;

/**
 * Resolve freshness for a single inventory entry.
 *
 * - `cron`        → look up `lastSuccessAt` in the cron-health record
 *                   set; tone is "stale" if the record is `stale`,
 *                   "live" otherwise. "unknown" if the record is missing.
 * - `last-known`  → look up `feed:lk:{key}.savedAt`; tone is "live"
 *                   when within 2× expectedFreshnessMinutes of now,
 *                   "stale" otherwise. "unknown" when the key is
 *                   missing (cache empty + fresh fetch failed).
 * - `on-demand`   → tone is "on-demand"; no timestamp.
 */
export function resolveFreshness(
  entry: InventoryEntry,
  ctx: {
    cronByWorkflow: Map<string, CronHealthRecord>;
    lastKnown: LastKnownLookup;
    /** When non-null, every cron staleness is computed against this clock. */
    nowMs: number;
    /**
     * For `last-known` sources, the cache write is considered "live"
     * if it's within this window. Defaults to 30 minutes — matches the
     * fastest live-HTTP route's CDN s-maxage in practice.
     */
    lastKnownLiveWindowMs?: number;
  },
): ResolvedFreshness {
  const liveWindow = ctx.lastKnownLiveWindowMs ?? 30 * 60 * 1000;
  return resolveFromSource(entry.freshness, ctx.cronByWorkflow, ctx.lastKnown, {
    nowMs: ctx.nowMs,
    liveWindowMs: liveWindow,
  });
}

function resolveFromSource(
  src: FreshnessSource,
  cronByWorkflow: Map<string, CronHealthRecord>,
  lastKnown: LastKnownLookup,
  opts: { nowMs: number; liveWindowMs: number },
): ResolvedFreshness {
  if (src.kind === "on-demand") {
    return {
      tone: "on-demand",
      lastSeenAt: null,
      note: "Fetched per request — no scheduled poll",
    };
  }
  if (src.kind === "cron") {
    const record = cronByWorkflow.get(src.workflow);
    if (!record || !record.lastSuccessAt) {
      return {
        tone: "unknown",
        lastSeenAt: null,
        note: "No successful run on record yet",
      };
    }
    const lastMs = Date.parse(record.lastSuccessAt);
    if (!Number.isFinite(lastMs)) {
      return {
        tone: "unknown",
        lastSeenAt: record.lastSuccessAt,
      };
    }
    const staleAfterMs = record.expectedIntervalMinutes * 2 * 60 * 1000;
    const stale = opts.nowMs - lastMs > staleAfterMs;
    return {
      tone: stale ? "stale" : "live",
      lastSeenAt: record.lastSuccessAt,
    };
  }
  // last-known
  const savedAt = lastKnown(src.key);
  if (!savedAt) {
    return {
      tone: "unknown",
      lastSeenAt: null,
      note: "No successful fetch on record yet",
    };
  }
  const savedMs = Date.parse(savedAt);
  if (!Number.isFinite(savedMs)) {
    return { tone: "unknown", lastSeenAt: savedAt };
  }
  const stale = opts.nowMs - savedMs > opts.liveWindowMs;
  return {
    tone: stale ? "stale" : "live",
    lastSeenAt: savedAt,
  };
}

/** Index a CronHealthRecord[] by workflow name for O(1) lookup. */
export function indexCronRecords(
  records: readonly CronHealthRecord[],
): Map<string, CronHealthRecord> {
  const out = new Map<string, CronHealthRecord>();
  for (const r of records) out.set(r.workflow, r);
  return out;
}

/**
 * Format a "Polled Xm ago" / "Y h ago" string. Bounded vocabulary so
 * the page stays predictable even at extreme ranges (negative clock
 * skew, decade-old timestamps from a corrupt cache, etc.).
 */
export function formatRelative(
  iso: string | null,
  nowMs: number = Date.now(),
): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const diff = nowMs - ms;
  if (diff < 0) return "Just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ms).toISOString().slice(0, 10);
}
