/**
 * Digest-send helper: gather every tracked tool's last-24h incidents.
 *
 * The composer (and its `pickLeadHook` logic) keys the subject line on
 * `incidents24h.length` — any incident on any tool inside the last 24h
 * flips the lead copy to "N tool incident(s)". This helper bundles the
 * four `fetchHistoricalIncidents` calls that `/api/status` already makes,
 * filters each to ≤ 24h, and returns a flat list.
 *
 * Kept in its own module (not inlined in the send route) so the pure
 * filtering logic is testable without touching the network.
 */

import {
  fetchHistoricalIncidents,
  type HistoricalIncident,
} from "@/lib/data/status-history";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type IncidentFetcher = (args: {
  incidentsApiUrl: string;
  cacheTag: string;
  componentFilter?: string[];
  days?: number;
}) => Promise<HistoricalIncident[]>;

export type FetchIncidents24hOpts = {
  /** Seam for tests. Defaults to `fetchHistoricalIncidents`. */
  fetcher?: IncidentFetcher;
  /** Seam for tests. Defaults to `Date.now()`. */
  now?: number;
};

export async function fetchIncidents24h(
  opts: FetchIncidents24hOpts = {},
): Promise<HistoricalIncident[]> {
  const fetcher = opts.fetcher ?? fetchHistoricalIncidents;
  const now = opts.now ?? Date.now();

  // Each source carries the tool id its incidents belong to so the digest
  // can render a "View on status page" link without re-deriving the tool
  // from the incident's name.
  const sources: Array<{
    toolId: string;
    args: Parameters<IncidentFetcher>[0];
  }> = [
    {
      toolId: "anthropic",
      args: {
        incidentsApiUrl: "https://status.claude.com/api/v2/incidents.json?limit=50",
        cacheTag: "anthropic-status-history",
        componentFilter: ["Claude Code"],
        days: 1,
      },
    },
    {
      toolId: "openai",
      args: {
        incidentsApiUrl: "https://status.openai.com/api/v2/incidents.json?limit=50",
        cacheTag: "openai-incidents-history",
        days: 1,
      },
    },
    {
      toolId: "github",
      args: {
        incidentsApiUrl: "https://www.githubstatus.com/api/v2/incidents.json?limit=50",
        cacheTag: "github-status-history",
        componentFilter: ["Copilot"],
        days: 1,
      },
    },
    {
      toolId: "windsurf",
      args: {
        incidentsApiUrl: "https://status.windsurf.com/api/v2/incidents.json?limit=50",
        cacheTag: "windsurf-status-history",
        days: 1,
      },
    },
  ];

  const results = await Promise.all(
    sources.map(async (s) => {
      const list = await safeFetch(fetcher, s.args);
      return list.map((inc) => ({ ...inc, toolId: s.toolId }));
    }),
  );
  const cutoff = now - ONE_DAY_MS;
  return results.flat().filter((i) => {
    const createdMs = Date.parse(i.createdAt);
    return Number.isFinite(createdMs) && createdMs >= cutoff;
  });
}

async function safeFetch(
  fetcher: IncidentFetcher,
  args: Parameters<IncidentFetcher>[0],
): Promise<HistoricalIncident[]> {
  try {
    return await fetcher(args);
  } catch {
    return [];
  }
}
