/**
 * Pure delta math for the SDK Adoption matrix panel.
 *
 * Each cell on the matrix is the within-package % delta of "this day's
 * count" vs the mean of the prior `baselineWindow` days. The matrix is
 * never normalised across packages — comparing PyPI downloads to Docker
 * pulls is unit-dishonest. Within a single package's row, the cell
 * intensities are comparable; across rows, only the sign + sparkline
 * trend are meaningful.
 *
 * Null counts (missing snapshots) cascade: the cell stays {count:null,
 * delta:null} and the renderer greys it. Nulls are excluded from any
 * baseline mean — they never imply zero. A baseline of zero (e.g. a
 * brand-new package with no prior downloads) returns null delta to
 * avoid div-by-zero noise.
 *
 * Pure, deterministic, no Date.now / no I/O. Same input → same output.
 */

export type CountByDate = {
  /** YYYY-MM-DD UTC. Order in the input array is preserved on output. */
  date: string;
  /** Today's count for the package's primary daily counter, or null when
   *  the snapshot for this date didn't capture a value. */
  count: number | null;
};

export type DeltaByDate = {
  date: string;
  count: number | null;
  /** (count - meanBaseline) / meanBaseline. Null when count is null,
   *  baseline window is empty, or baseline mean is zero. */
  delta: number | null;
};

export function deltasFromCounts(
  countsByDate: CountByDate[],
  baselineWindow: number = 30,
): DeltaByDate[] {
  const out: DeltaByDate[] = [];
  for (let i = 0; i < countsByDate.length; i++) {
    const { date, count } = countsByDate[i];
    if (count === null) {
      out.push({ date, count: null, delta: null });
      continue;
    }
    const start = Math.max(0, i - baselineWindow);
    let sum = 0;
    let n = 0;
    for (let j = start; j < i; j++) {
      const c = countsByDate[j].count;
      if (c === null) continue;
      sum += c;
      n += 1;
    }
    if (n === 0) {
      out.push({ date, count, delta: null });
      continue;
    }
    const baseline = sum / n;
    if (baseline === 0) {
      out.push({ date, count, delta: null });
      continue;
    }
    out.push({ date, count, delta: (count - baseline) / baseline });
  }
  return out;
}
