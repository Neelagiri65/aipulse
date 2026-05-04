/**
 * Genesis Report block — top SDK adoption gainers over a 30-day window.
 *
 * Pure function over the existing `SdkAdoptionDto` (assembled by
 * `assembleSdkAdoption` and consumed today by /panels/sdk-adoption).
 * For each package with at least `windowDays` of non-null history,
 * computes the % growth as
 *
 *     ((latestNonNullCount - countNDaysAgo) / countNDaysAgo) * 100
 *
 * sorts by that growth descending, takes the top `topN`. Reads from
 * the same DTO the dashboard uses — no new fetch, no synthesis.
 *
 * Trust contract:
 *   - sourceUrl per row is the canonical aggregator endpoint per
 *     registry (pypistats / npmjs / crates / docker / brew / vscode).
 *     Already declared in `data-sources.ts`; mirrored here as the
 *     section's reader-facing citation.
 *   - The package's own `caveat` field (e.g. PyPI's pypistats wording)
 *     travels with the row — verbatim, not editorialised.
 *   - Sanity warnings:
 *       - Growth > +1000% is flagged (likely a denominator-near-zero
 *         artifact, not a real shift). Row is INCLUDED but warned.
 *       - Growth < -90% is flagged for the same denominator reason.
 *       - Packages with fewer than `windowDays` of non-null history
 *         are silently excluded — not a sanity concern, just out of
 *         scope for a 30-day comparison.
 *   - When the input has zero qualifying packages, returns
 *     `{rows: [], generatedAt, sanityWarnings}` — honest empty, no
 *     fabricated rows.
 *
 * Pure: no IO, no clock reads (callers pass `now`).
 */

import type { GenesisBlockResult, GenesisBlockRow } from "@/lib/reports/types";
import type {
  SdkAdoptionDto,
  SdkAdoptionPackage,
  SdkAdoptionRegistry,
} from "@/lib/data/sdk-adoption";

export const SDK_GROWTH_SANITY_HIGH = 1000;
export const SDK_GROWTH_SANITY_LOW = -90;
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_TOP_N = 3;

const REGISTRY_SOURCE: Record<
  SdkAdoptionRegistry,
  { url: string; label: string }
> = {
  pypi: { url: "https://pypistats.org", label: "pypistats.org" },
  npm: { url: "https://www.npmjs.com", label: "npmjs.org" },
  crates: { url: "https://crates.io", label: "crates.io" },
  docker: { url: "https://hub.docker.com", label: "Docker Hub" },
  brew: {
    url: "https://formulae.brew.sh",
    label: "Homebrew formulae",
  },
  vscode: {
    url: "https://marketplace.visualstudio.com",
    label: "VS Code Marketplace",
  },
};

export type SdkGainersBlockInput = {
  dto: SdkAdoptionDto;
  /** Window in days. Defaults to 30. Tests use a smaller window. */
  windowDays?: number;
  /** How many rows to keep. Defaults to 3. */
  topN?: number;
  /** Optional clock seam — used in tests to make `generatedAt`
   *  deterministic. Production omits and gets `Date.now()`. */
  now?: () => Date;
};

export function loadSdkAdoptionGainers30dBlock(
  input: SdkGainersBlockInput,
): GenesisBlockResult {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const topN = input.topN ?? DEFAULT_TOP_N;
  const now = (input.now ?? (() => new Date()))();

  const candidates: Array<{
    pkg: SdkAdoptionPackage;
    pctGrowth: number;
    latestCount: number;
    baseCount: number;
    effectiveDays: number;
  }> = [];

  for (const pkg of input.dto.packages) {
    const reading = computeWindowGrowth(pkg, windowDays);
    if (!reading) continue;
    candidates.push({
      pkg,
      pctGrowth: reading.pctGrowth,
      latestCount: reading.latestCount,
      baseCount: reading.baseCount,
      effectiveDays: reading.effectiveDays,
    });
  }

  candidates.sort((a, b) => b.pctGrowth - a.pctGrowth);

  // Sanity gate: rows whose growth violates the pre-committed bounds
  // are EXCLUDED from the public top-N (operator policy locked at S62f
  // — "do not launch with a number the system says might be wrong").
  // The warnings are still emitted on `sanityWarnings[]` so ops can
  // monitor data-quality drift; the public reader sees only rows the
  // system trusts. Excluded rows are replaced by the next-best
  // qualifying candidate to keep the top-N filled when possible.
  const sanityWarnings: string[] = [];
  const rows: GenesisBlockRow[] = [];
  for (const cand of candidates) {
    if (rows.length >= topN) break;
    const { pkg, pctGrowth, latestCount, effectiveDays } = cand;
    if (pctGrowth > SDK_GROWTH_SANITY_HIGH) {
      sanityWarnings.push(
        `${pkg.label}: ${formatPct(pctGrowth)} growth exceeds the +${SDK_GROWTH_SANITY_HIGH}% sanity ceiling — excluded from display (denominator-near-zero artifact suspected).`,
      );
      continue;
    }
    if (pctGrowth < SDK_GROWTH_SANITY_LOW) {
      sanityWarnings.push(
        `${pkg.label}: ${formatPct(pctGrowth)} growth below the ${SDK_GROWTH_SANITY_LOW}% sanity floor — excluded from display.`,
      );
      continue;
    }
    const source = REGISTRY_SOURCE[pkg.registry];
    rows.push({
      label: pkg.label,
      value: `${formatCount(latestCount)} ${pkg.counterUnits}`,
      delta: `${formatPct(pctGrowth)} over ${effectiveDays}d`,
      sourceUrl: source.url,
      sourceLabel: source.label,
      caveat: pkg.caveat ?? undefined,
    });
  }

  return {
    rows,
    generatedAt: now.toISOString(),
    sanityWarnings,
  };
}

/**
 * Compute % growth across a `windowDays` window, tolerating sparse
 * data. The day axis in `pkg.days` is oldest-first by the assembler's
 * contract — `days[length - 1]` is today, `days[length - 1 - N]` is
 * N calendar days ago. Many packages have null tails (today's pull
 * hasn't landed) and null gaps (some registries publish only weekly).
 *
 * Honest reading rule:
 *   1. Find the newest non-null entry. Walk backwards from the end
 *      of the array, scanning at most `windowDays` indices so we
 *      never reach for ancient data.
 *   2. From there, find the oldest non-null entry within the window.
 *      The "window" is anchored at the newest non-null index — the
 *      base index is `newestIdx - windowDays` (clamped to ≥ 0). We
 *      scan forwards from the base looking for the first non-null,
 *      so the comparison is "newest-known vs. oldest-known-within-window".
 *
 * Returns the readings PLUS `effectiveDays` (newestIdx - oldestIdx),
 * which the row formatter prints — the report should never claim a
 * 30-day comparison when the underlying data only spans 11 days.
 *
 * Returns null when:
 *   - the package has zero non-null entries in its days array,
 *   - the only non-null entry is at the very end (no baseline),
 *   - the chosen baseline is 0 (would divide by zero).
 */
export function computeWindowGrowth(
  pkg: SdkAdoptionPackage,
  windowDays: number,
): {
  pctGrowth: number;
  latestCount: number;
  baseCount: number;
  /** Calendar days actually spanned between baseline and latest.
   *  May be < windowDays when the data is sparse. The framing prose
   *  must NOT claim "30-day growth" when this number is smaller. */
  effectiveDays: number;
} | null {
  const days = pkg.days;
  if (days.length === 0) return null;
  // Step 1: newest non-null, scanning at most windowDays backwards.
  const lookbackLimit = Math.min(windowDays, days.length - 1);
  let newestIdx = -1;
  for (let i = days.length - 1; i >= days.length - 1 - lookbackLimit; i -= 1) {
    if (i < 0) break;
    if (days[i]?.count != null) {
      newestIdx = i;
      break;
    }
  }
  if (newestIdx < 0) return null;
  // Step 2: oldest non-null within the window anchored at newest.
  const baseAnchor = Math.max(0, newestIdx - windowDays);
  let oldestIdx = -1;
  for (let i = baseAnchor; i < newestIdx; i += 1) {
    if (days[i]?.count != null) {
      oldestIdx = i;
      break;
    }
  }
  if (oldestIdx < 0) return null;
  const latest = days[newestIdx].count!;
  const base = days[oldestIdx].count!;
  if (base === 0) return null;
  const pctGrowth = ((latest - base) / base) * 100;
  return {
    pctGrowth,
    latestCount: latest,
    baseCount: base,
    effectiveDays: newestIdx - oldestIdx,
  };
}

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatPct(p: number): string {
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}
