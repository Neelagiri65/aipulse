/**
 * Lab ranking helper — picks the top-N labs by 7-day activity from
 * the existing LabsPayload. Pure function over the payload that
 * `fetchLabActivity` already produces; no fresh fetch.
 *
 * Tie-breaker: when two labs share the same 7d total, the one with
 * fewer stale repos wins (we trust complete pictures over partial
 * ones); on a further tie, lexical id sort is the deterministic
 * fallback so the ranking is stable across requests.
 */

import type { LabActivity, LabsPayload } from "@/lib/data/fetch-labs";

export const LAB_PAGE_TOP_N_DEFAULT = 10;

export function pickTopLabsBy7dActivity(
  payload: LabsPayload,
  n: number = LAB_PAGE_TOP_N_DEFAULT,
): LabActivity[] {
  if (n <= 0) return [];
  const sorted = [...payload.labs].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const aStale = a.repos.filter((r) => r.stale).length;
    const bStale = b.repos.filter((r) => r.stale).length;
    if (aStale !== bStale) return aStale - bStale;
    return a.id.localeCompare(b.id);
  });
  return sorted.slice(0, n);
}

export function isLabInTopN(
  payload: LabsPayload,
  slug: string,
  n: number = LAB_PAGE_TOP_N_DEFAULT,
): boolean {
  const top = pickTopLabsBy7dActivity(payload, n);
  return top.some((l) => l.id === slug);
}
