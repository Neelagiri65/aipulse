/**
 * Gawk — Platform health fetcher.
 *
 * Reads the four platform-infrastructure status pages (Vercel, Supabase,
 * Cloudflare, Upstash) that gawk.dev itself depends on. Distinct from the
 * AI-tool fetcher in `fetch-status.ts`:
 *
 *   - Each upstream is plain Statuspage v2 — no per-component worst-of,
 *     no GitHub-issue side-channel, no Redis sample history. Top-line
 *     `status.indicator` and active incidents are the only signals.
 *   - Surfaced on /admin only — the public Tool Health card grid stays
 *     AI-focused. See data-sources.ts entries (powersFeature:
 *     "platform-health-*").
 *
 * Graceful degradation: per-source fetch failures are reported in the
 * returned `failures` array; successful sources still render. The /admin
 * UI shows a grey "no data" cell for any source whose entry is absent.
 */

import {
  CLOUDFLARE_STATUS,
  SUPABASE_STATUS,
  UPSTASH_STATUS,
  VERCEL_STATUS,
  type DataSource,
} from "@/lib/data-sources";
import {
  overallStatus,
  type StatuspageSummary,
} from "@/lib/status-adapter";
import type {
  ToolHealthStatus,
  ToolIncident,
} from "@/components/health/tools";

const REVALIDATE_SECONDS = 300;

export type PlatformId =
  | "vercel"
  | "supabase"
  | "cloudflare"
  | "upstash";

export type PlatformHealth = {
  id: PlatformId;
  /** Display name from the data-sources entry. */
  sourceName: string;
  /** Public status-page URL. */
  sourceUrl: string;
  status: ToolHealthStatus;
  /** Active incidents (investigating / identified / monitoring). */
  activeIncidents: ToolIncident[];
  /** ISO timestamp of this poll. */
  lastCheckedAt: string;
};

export type PlatformStatusResult = {
  data: Partial<Record<PlatformId, PlatformHealth>>;
  polledAt: string;
  failures: Array<{ id: PlatformId; sourceId: string; message: string }>;
};

const ACTIVE_INCIDENT_STATES = new Set([
  "investigating",
  "identified",
  "monitoring",
]);

function activeIncidentsOf(summary: StatuspageSummary): ToolIncident[] {
  if (!summary.incidents) return [];
  return summary.incidents
    .filter((i) => ACTIVE_INCIDENT_STATES.has(i.status))
    .map((i) => ({
      id: i.id,
      name: i.name,
      status: i.status,
      createdAt: i.created_at,
    }));
}

async function fetchSummary(
  source: DataSource,
): Promise<StatuspageSummary | Error> {
  if (!source.apiUrl) return new Error(`no apiUrl on ${source.id}`);
  try {
    const res = await fetch(source.apiUrl, {
      next: { revalidate: REVALIDATE_SECONDS, tags: [source.id] },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return new Error(`${source.id} returned ${res.status}`);
    return (await res.json()) as StatuspageSummary;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

const PLATFORM_SOURCES: Array<{ id: PlatformId; source: DataSource }> = [
  { id: "vercel", source: VERCEL_STATUS },
  { id: "supabase", source: SUPABASE_STATUS },
  { id: "cloudflare", source: CLOUDFLARE_STATUS },
  { id: "upstash", source: UPSTASH_STATUS },
];

export async function fetchAllPlatformStatus(): Promise<PlatformStatusResult> {
  const polledAt = new Date().toISOString();
  const failures: PlatformStatusResult["failures"] = [];
  const data: PlatformStatusResult["data"] = {};

  const results = await Promise.all(
    PLATFORM_SOURCES.map(async ({ id, source }) => ({
      id,
      source,
      summary: await fetchSummary(source),
    })),
  );

  for (const { id, source, summary } of results) {
    if (summary instanceof Error) {
      failures.push({ id, sourceId: source.id, message: summary.message });
      continue;
    }
    data[id] = {
      id,
      sourceName: source.name,
      sourceUrl: source.url,
      status: overallStatus(summary),
      activeIncidents: activeIncidentsOf(summary),
      lastCheckedAt: polledAt,
    };
  }

  return { data, polledAt, failures };
}
