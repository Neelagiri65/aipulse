/**
 * Pure helpers for the master-detail stat bars rendered on every panel
 * (docs/design-spec-v2.md → FIX-13). Kept framework-free so the count
 * formulae can be unit-tested without React.
 */

/**
 * Aggregate `items` by a key extractor and return the top `limit`
 * `{ key, count }` pairs in descending count order. Ties broken by
 * key alphabetical so the output is deterministic across renders.
 */
export function topCategoryCounts<T>(
  items: readonly T[],
  key: (item: T) => string | null | undefined,
  limit = 3,
): Array<{ key: string; count: number }> {
  if (items.length === 0) return [];
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/**
 * Specialisation for ISO country codes (uppercase 2-letter, e.g. "US",
 * "CN"). Same shape as topCategoryCounts, kept as a named alias so call
 * sites read clearly at the panel level. Limit defaults to 5 because
 * country breakdowns benefit from a wider tail than category breakdowns.
 */
export function topCountryCounts<T extends { country: string }>(
  items: readonly T[],
  limit = 5,
): Array<{ key: string; count: number }> {
  return topCategoryCounts(items, (item) => item.country, limit);
}
