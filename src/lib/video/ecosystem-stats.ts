/**
 * Hero-row stats for the daily video (`SOURCES · CRONS · AI LABS`).
 *
 * Every value here is either read from something real or `null`. There are
 * no fallback constants: a stat the fetch could not read is `null`, and the
 * hero omits that tile rather than showing a stand-in number.
 */

export type EcosystemStats = {
  /** `VERIFIED_SOURCES.length` — the same count the site's chrome shows. */
  sources: number;
  /** `/api/cron-health` `total`, or `null` when that endpoint was unreadable. */
  crons: number | null;
  /** Labs in `/api/v1/labs`, or `null` when that endpoint was unreadable. */
  labs: number | null;
  totalEvents: number;
  activeCountries: number;
};

export type EcosystemStatsInput = {
  verifiedSourceCount: number;
  cronHealth: { total: number } | null;
  /** The labs array from `/api/v1/labs`; `null` when the fetch failed. */
  labs: readonly unknown[] | null;
  byCountry: Record<string, { current24h?: number }>;
};

export function buildEcosystemStats(input: EcosystemStatsInput): EcosystemStats {
  const cronTotal = input.cronHealth?.total;
  const crons = typeof cronTotal === "number" && Number.isFinite(cronTotal) ? cronTotal : null;
  const labs = input.labs === null ? null : input.labs.length;
  const totalEvents = Object.values(input.byCountry).reduce((s, c) => s + (c.current24h ?? 0), 0);
  const activeCountries = Object.keys(input.byCountry).length;
  return { sources: input.verifiedSourceCount, crons, labs, totalEvents, activeCountries };
}
