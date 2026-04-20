/**
 * Pure mapping from RssSourcePanel[] → GlobePoint[].
 *
 * Every regional publisher shows up on the map at its HQ coord as an
 * amber dot. Size scales log-linearly from RSS_MIN_SIZE (zero
 * activity) up to RSS_MAX_SIZE at the 95th-percentile 24h count — one
 * runaway publisher can't squash the rest of the dots to pinpoints.
 *
 * Dots for sources with zero 24h items get `rssInactive: true` so the
 * renderer can dim them (RSS_INACTIVE_OPACITY) while keeping the dot
 * present and clickable — "the publisher is tracked but has nothing
 * in the last 24h" is information, not a bug.
 *
 * Stale dots (staleHours > 24 or null) render grey instead of amber:
 * the renderer reads `rssStale` from meta and paints the point
 * RSS_STALE_GREY. Same treatment as HN author-coord gaps — never fake
 * a live signal when the pipe is down.
 *
 * Deterministic: same input always yields the same output. Tests at
 * `__tests__/rss-to-points.test.ts` pin the contract.
 */

import type { GlobePoint } from "@/components/globe/Globe";
import type { RssSourcePanel } from "@/lib/data/wire-rss";

export const RSS_AMBER = "#f97316";
export const RSS_STALE_GREY = "#64748b";
export const RSS_MIN_SIZE = 0.3;
export const RSS_MAX_SIZE = 1.1;
export const RSS_INACTIVE_OPACITY = 0.35;

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor(sortedAsc.length * p)),
  );
  return sortedAsc[idx];
}

export function rssToGlobePoints(sources: RssSourcePanel[]): GlobePoint[] {
  if (sources.length === 0) return [];

  const counts = sources.map((s) => s.itemsLast24h).sort((a, b) => a - b);
  const p95 = Math.max(1, percentile(counts, 0.95));
  const logMax = Math.log(1 + p95);
  const sizeFor = (count: number): number => {
    if (count <= 0) return RSS_MIN_SIZE;
    const ratio = Math.min(1, Math.log(1 + count) / logMax);
    return RSS_MIN_SIZE + (RSS_MAX_SIZE - RSS_MIN_SIZE) * ratio;
  };

  return sources.map((src) => ({
    lat: src.lat,
    lng: src.lng,
    color: src.stale ? RSS_STALE_GREY : RSS_AMBER,
    size: sizeFor(src.itemsLast24h),
    meta: {
      kind: "rss",
      rssSourceId: src.id,
      rssDisplayName: src.displayName,
      rssCity: src.city,
      rssCountry: src.country,
      rssLang: src.lang,
      rssHqSourceUrl: src.hqSourceUrl,
      rss24h: src.itemsLast24h,
      rss7d: src.itemsLast7d,
      rssStale: src.stale,
      rssInactive: src.itemsLast24h === 0,
      rssRecentItems: src.recentItems,
      rssCaveat: src.caveat,
      rssFeedFormat: src.feedFormat,
      rssStaleHours: src.staleHours,
      rssLastFetchOkTs: src.lastFetchOkTs,
      rssSource: src,
    },
  }));
}
