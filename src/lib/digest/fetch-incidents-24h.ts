/**
 * Digest-send helper: gather every tracked tool's incidents from the
 * last 48 hours, partitioned into the current 24h window and the prior
 * 24h window. The current window drives the digest's tool-health
 * section; the prior count is the "vs N yesterday" baseline so the
 * reader can tell whether today's count is normal.
 *
 * Single fetch per source (days=2) avoids doubling the status-page API
 * traffic. The composer (and its `pickLeadHook` logic) keys the subject
 * line on `current24h.length` — any incident on any tool inside the
 * last 24h flips the lead copy to "N tool incident(s)".
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

export type Incidents48hSplit = {
  /** Incidents created in the [now-24h, now] window. */
  current24h: HistoricalIncident[];
  /** Count of incidents created in the [now-48h, now-24h) window.
   *  Count-only because the digest never displays prior-window
   *  incidents — it only uses them as a baseline. */
  priorCount: number;
};

export async function fetchIncidents24h(
  opts: FetchIncidents24hOpts = {},
): Promise<Incidents48hSplit> {
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
        days: 2,
      },
    },
    {
      toolId: "openai",
      args: {
        incidentsApiUrl: "https://status.openai.com/api/v2/incidents.json?limit=50",
        cacheTag: "openai-incidents-history",
        days: 2,
      },
    },
    {
      toolId: "github",
      args: {
        incidentsApiUrl: "https://www.githubstatus.com/api/v2/incidents.json?limit=50",
        cacheTag: "github-status-history",
        componentFilter: ["Copilot"],
        days: 2,
      },
    },
    {
      toolId: "windsurf",
      args: {
        incidentsApiUrl: "https://status.windsurf.com/api/v2/incidents.json?limit=50",
        cacheTag: "windsurf-status-history",
        days: 2,
      },
    },
  ];

  const results = await Promise.all(
    sources.map(async (s) => {
      const list = await safeFetch(fetcher, s.args);
      return list.map((inc) => ({ ...inc, toolId: s.toolId }));
    }),
  );
  const all = results.flat();
  const currentCutoff = now - ONE_DAY_MS;
  const priorCutoff = now - 2 * ONE_DAY_MS;
  const current24h: HistoricalIncident[] = [];
  let priorCount = 0;
  for (const i of all) {
    const createdMs = Date.parse(i.createdAt);
    if (!Number.isFinite(createdMs)) continue;
    if (createdMs >= currentCutoff) {
      current24h.push(i);
    } else if (createdMs >= priorCutoff) {
      priorCount += 1;
    }
  }
  return { current24h, priorCount };
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
