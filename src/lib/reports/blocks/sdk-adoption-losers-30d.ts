/**
 * Genesis Report block — top SDK adoption losers over a 30-day window.
 *
 * Mirror of the gainers block: same growth math (`computeWindowGrowth`,
 * exported from the gainers module so the math stays in one place),
 * but sorts ascending and returns the bottom-N (steepest declines).
 *
 * Trust contract is identical to the gainers block:
 *   - sourceUrl per row from the canonical aggregator endpoint per
 *     registry (pypistats / npmjs / crates / docker / brew / vscode).
 *   - per-package caveat travels verbatim on the row.
 *   - sanity-bound: declines past `SDK_GROWTH_SANITY_LOW` (-90%) are
 *     flagged as likely denominator-near-zero artifacts and the
 *     operator must verify before launch. Rows are INCLUDED with
 *     the warning, not auto-suppressed.
 *
 * Pure: no IO, no clock reads (callers pass `now`).
 */

import type { GenesisBlockResult, GenesisBlockRow } from "@/lib/reports/types";
import type {
  SdkAdoptionDto,
  SdkAdoptionPackage,
  SdkAdoptionRegistry,
} from "@/lib/data/sdk-adoption";
import {
  computeWindowGrowth,
  SDK_GROWTH_SANITY_LOW,
} from "@/lib/reports/blocks/sdk-adoption-gainers-30d";

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
  brew: { url: "https://formulae.brew.sh", label: "Homebrew formulae" },
  vscode: {
    url: "https://marketplace.visualstudio.com",
    label: "VS Code Marketplace",
  },
};

export type SdkLosersBlockInput = {
  dto: SdkAdoptionDto;
  windowDays?: number;
  topN?: number;
  now?: () => Date;
};

export function loadSdkAdoptionLosers30dBlock(
  input: SdkLosersBlockInput,
): GenesisBlockResult {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const topN = input.topN ?? DEFAULT_TOP_N;
  const now = (input.now ?? (() => new Date()))();

  const candidates: Array<{
    pkg: SdkAdoptionPackage;
    pctGrowth: number;
    latestCount: number;
  }> = [];
  for (const pkg of input.dto.packages) {
    const reading = computeWindowGrowth(pkg, windowDays);
    if (!reading) continue;
    // Losers means strictly negative growth — packages that held flat
    // or grew don't qualify for "loser of the month" framing.
    if (reading.pctGrowth >= 0) continue;
    candidates.push({
      pkg,
      pctGrowth: reading.pctGrowth,
      latestCount: reading.latestCount,
    });
  }
  // Sort ascending so the steepest decline is row 0.
  candidates.sort((a, b) => a.pctGrowth - b.pctGrowth);
  const bottom = candidates.slice(0, topN);

  const rows: GenesisBlockRow[] = bottom.map(
    ({ pkg, pctGrowth, latestCount }) => {
      const source = REGISTRY_SOURCE[pkg.registry];
      return {
        label: pkg.label,
        value: `${formatCount(latestCount)} ${pkg.counterUnits}`,
        delta: `${formatPct(pctGrowth)} ${windowDays}d`,
        sourceUrl: source.url,
        sourceLabel: source.label,
        caveat: pkg.caveat ?? undefined,
      };
    },
  );

  const sanityWarnings: string[] = [];
  for (const { pkg, pctGrowth } of bottom) {
    if (pctGrowth < SDK_GROWTH_SANITY_LOW) {
      sanityWarnings.push(
        `${pkg.label}: ${formatPct(pctGrowth)} growth below the ${SDK_GROWTH_SANITY_LOW}% sanity floor — denominator-near-zero artifact suspected, verify before launch.`,
      );
    }
  }

  return {
    rows,
    generatedAt: now.toISOString(),
    sanityWarnings,
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
