/**
 * Previous / next archived digest for a given date.
 *
 * `dates` is whatever listDigestDates returned — newest first, but the
 * function sorts defensively because a caller passing ascending order would
 * otherwise silently swap prev and next. "prev" is the older issue, "next"
 * the newer one, matching how a reader steps through a daily archive.
 *
 * Dates are compared as ISO strings (YYYY-MM-DD sorts lexically), so a date
 * that is not itself archived still gets its correct neighbours.
 */
export type DigestNeighbours = { prev: string | null; next: string | null };

export function digestNeighbours(dates: readonly string[], date: string): DigestNeighbours {
  const sorted = [...new Set(dates)].sort();
  let prev: string | null = null;
  let next: string | null = null;
  for (const d of sorted) {
    if (d < date) prev = d;
    else if (d > date) {
      next = d;
      break;
    }
  }
  return { prev, next };
}

/** Group ISO dates by "YYYY-MM", newest month first, newest date first inside each. */
export function groupDigestDatesByMonth(dates: readonly string[]): { month: string; dates: string[] }[] {
  const byMonth = new Map<string, string[]>();
  for (const d of [...new Set(dates)].sort().reverse()) {
    const m = d.slice(0, 7);
    const list = byMonth.get(m);
    if (list) list.push(d);
    else byMonth.set(m, [d]);
  }
  return [...byMonth.entries()].map(([month, ds]) => ({ month, dates: ds }));
}
