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
  }> = [];

  for (const pkg of input.dto.packages) {
    const reading = computeWindowGrowth(pkg, windowDays);
    if (!reading) continue;
    candidates.push({
      pkg,
      pctGrowth: reading.pctGrowth,
      latestCount: reading.latestCount,
      baseCount: reading.baseCount,
    });
  }

  candidates.sort((a, b) => b.pctGrowth - a.pctGrowth);
  const top = candidates.slice(0, topN);

  const rows: GenesisBlockRow[] = top.map(({ pkg, pctGrowth, latestCount }) => {
    const source = REGISTRY_SOURCE[pkg.registry];
    return {
      label: pkg.label,
      value: `${formatCount(latestCount)} ${pkg.counterUnits}`,
      delta: `${formatPct(pctGrowth)} ${windowDays}d`,
      sourceUrl: source.url,
      sourceLabel: source.label,
      caveat: pkg.caveat ?? undefined,
    };
  });

  const sanityWarnings: string[] = [];
  for (const { pkg, pctGrowth } of top) {
    if (pctGrowth > SDK_GROWTH_SANITY_HIGH) {
      sanityWarnings.push(
        `${pkg.label}: ${formatPct(pctGrowth)} growth exceeds the +${SDK_GROWTH_SANITY_HIGH}% sanity ceiling — denominator-near-zero artifact suspected, verify before launch.`,
      );
    } else if (pctGrowth < SDK_GROWTH_SANITY_LOW) {
      sanityWarnings.push(
        `${pkg.label}: ${formatPct(pctGrowth)} growth below the ${SDK_GROWTH_SANITY_LOW}% sanity floor — verify before launch.`,
      );
    }
  }

  return {
    rows,
    generatedAt: now.toISOString(),
    sanityWarnings,
  };
}

/**
 * Compute % growth between the most-recent non-null count and the
 * count `windowDays` ago. Returns null when:
 *   - the package has fewer than `windowDays + 1` total day entries,
 *   - the latest entry is null,
 *   - the day-N-ago entry is null,
 *   - the day-N-ago count is 0 (would divide by zero).
 *
 * The day axis in `pkg.days` is oldest-first by the assembler's
 * contract — `days[length - 1]` is today, `days[length - 1 - N]` is
 * N days ago.
 */
export function computeWindowGrowth(
  pkg: SdkAdoptionPackage,
  windowDays: number,
): { pctGrowth: number; latestCount: number; baseCount: number } | null {
  const days = pkg.days;
  if (days.length < windowDays + 1) return null;
  const latestIdx = days.length - 1;
  const baseIdx = latestIdx - windowDays;
  const latest = days[latestIdx]?.count;
  const base = days[baseIdx]?.count;
  if (latest == null || base == null) return null;
  if (base === 0) return null;
  const pctGrowth = ((latest - base) / base) * 100;
  return { pctGrowth, latestCount: latest, baseCount: base };
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
