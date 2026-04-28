/**
 * Gawk — SDK_TREND deriver
 *
 * Pure function over `SdkAdoptionDto`. Emits one Card per package
 * whose most-recent daily delta exceeds the locked threshold
 * (`FEED_TRIGGERS.SDK_TREND_WOW_PCT` = 10, strictly greater than,
 * applied to the day's `delta` fraction so 0.10 does NOT fire and
 * 0.15 fires). Fires on negative deltas too (downward trend is
 * just as newsworthy).
 */

import {
  CRATES_DOWNLOADS,
  DOCKER_HUB_PULLS,
  HOMEBREW_INSTALLS,
  NPM_DOWNLOADS,
  PYPI_DOWNLOADS,
  type DataSource,
} from "@/lib/data-sources";
import type {
  SdkAdoptionDto,
  SdkAdoptionRegistry,
} from "@/lib/data/sdk-adoption";
import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES, FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";

const REGISTRY_SOURCE: Record<SdkAdoptionRegistry, DataSource> = {
  pypi: PYPI_DOWNLOADS,
  npm: NPM_DOWNLOADS,
  crates: CRATES_DOWNLOADS,
  docker: DOCKER_HUB_PULLS,
  brew: HOMEBREW_INSTALLS,
};

const TRIGGER = FEED_TRIGGERS.SDK_TREND_WOW_PCT / 100;

export function deriveSdkTrendCards(dto: SdkAdoptionDto): Card[] {
  const cards: Card[] = [];

  for (const pkg of dto.packages) {
    if (pkg.days.length === 0) continue;
    const latest = pkg.days[pkg.days.length - 1];
    if (latest.delta === null) continue;
    if (Math.abs(latest.delta) <= TRIGGER) continue;
    if (!pkg.latest.fetchedAt) continue;

    const source = REGISTRY_SOURCE[pkg.registry];
    const pct = Math.round(latest.delta * 100);
    const sign = pct >= 0 ? "+" : "";
    const timestampMs = new Date(pkg.latest.fetchedAt).getTime();

    cards.push({
      id: cardId("SDK_TREND", pkg.id, timestampMs),
      type: "SDK_TREND",
      severity: FEED_SEVERITIES.SDK_TREND,
      headline: `${pkg.label} on ${pkg.registry} ${sign}${pct}% vs baseline`,
      detail: `${pkg.counterName} on ${latest.date}: ${
        latest.count ?? "—"
      } ${pkg.counterUnits}.`,
      sourceName: source.name,
      sourceUrl: source.url,
      timestamp: pkg.latest.fetchedAt,
      meta: {
        registry: pkg.registry,
        packageLabel: pkg.label,
        deltaPct: pct,
        latestCount: latest.count ?? 0,
      },
    });
  }
  return cards;
}
