/**
 * Server-side fetcher for all three tool status pages. Called by both
 * the API route (client polling) and the page component (SSR).
 *
 * Caching strategy: Next.js fetch cache with `revalidate: 300` (5 min).
 * Vercel serves this from the Data Cache so the underlying HTTP request
 * fires once per 5-minute window regardless of how many polls hit it.
 */

import {
  ANTHROPIC_STATUS,
  GITHUB_STATUS,
  OPENAI_INCIDENTS,
  OPENAI_STATUS,
  WINDSURF_STATUS,
  type DataSource,
} from "@/lib/data-sources";
import {
  componentStatusByName,
  componentStatusToToolStatus,
  overallStatus,
  type StatuspageComponentStatus,
  type StatuspageSummary,
} from "@/lib/status-adapter";
import type {
  ToolHealthData,
  ToolConfig,
  ToolIncident,
  ToolHealthStatus,
} from "@/components/health/tools";

const REVALIDATE_SECONDS = 300;

export type StatusResult = {
  data: Partial<Record<ToolConfig["id"], ToolHealthData>>;
  /** ISO timestamp of this server-side poll. */
  polledAt: string;
  /** Per-tool failures, for debugging. Empty on full success. */
  failures: Array<{ toolId: string; sourceId: string; message: string }>;
};

async function fetchStatuspage(
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

/**
 * Statuspage incident lifecycle: investigating → identified → monitoring →
 * resolved → postmortem. The first three are unresolved — we surface them on
 * the card even when components read "operational" (during monitoring,
 * components flip green but the incident is still open).
 */
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

type IncidentsPayload = { incidents?: Array<{ id: string; name: string; status: string; created_at: string }> };

async function fetchIncidents(source: DataSource): Promise<ToolIncident[] | Error> {
  if (!source.apiUrl) return new Error(`no apiUrl on ${source.id}`);
  try {
    const res = await fetch(source.apiUrl, {
      next: { revalidate: REVALIDATE_SECONDS, tags: [source.id] },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return new Error(`${source.id} returned ${res.status}`);
    const json = (await res.json()) as IncidentsPayload;
    const all = json.incidents ?? [];
    return all
      .filter((i) => ACTIVE_INCIDENT_STATES.has(i.status))
      .map((i) => ({
        id: i.id,
        name: i.name,
        status: i.status,
        createdAt: i.created_at,
      }));
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Worst-of over a list of component statuses. Used for tools that map to
 * multiple components on a single status page (e.g. OpenAI Codex = Codex Web +
 * Codex API). Order: major_outage > partial_outage > degraded > operational >
 * unknown.
 */
function worstStatus(components: StatuspageComponentStatus[]): ToolHealthStatus {
  const rank: Record<StatuspageComponentStatus, number> = {
    operational: 0,
    under_maintenance: 1,
    degraded_performance: 2,
    partial_outage: 3,
    major_outage: 4,
  };
  let worst: StatuspageComponentStatus | undefined;
  for (const c of components) {
    if (!worst || rank[c] > rank[worst]) worst = c;
  }
  if (!worst) return "unknown";
  return componentStatusToToolStatus(worst);
}

function findComponent(
  summary: StatuspageSummary,
  name: string,
): StatuspageComponentStatus | undefined {
  return summary.components?.find(
    (c) => c.name.toLowerCase() === name.toLowerCase(),
  )?.status;
}

async function fetchClaudeCodeIssues(): Promise<number | Error> {
  const token = process.env.GH_TOKEN;
  if (!token) return new Error("GH_TOKEN not set");
  try {
    const res = await fetch(
      "https://api.github.com/search/issues?q=repo:anthropics/claude-code+is:issue+is:open&per_page=1",
      {
        next: { revalidate: 3600, tags: ["gh-issues-claude-code"] },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) return new Error(`issues search returned ${res.status}`);
    const json = (await res.json()) as { total_count: number };
    return json.total_count;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

export async function fetchAllStatus(): Promise<StatusResult> {
  const polledAt = new Date().toISOString();
  const failures: StatusResult["failures"] = [];

  const [anthropic, openai, openaiIncidents, github, windsurf, claudeIssues] =
    await Promise.all([
      fetchStatuspage(ANTHROPIC_STATUS),
      fetchStatuspage(OPENAI_STATUS),
      fetchIncidents(OPENAI_INCIDENTS),
      fetchStatuspage(GITHUB_STATUS),
      fetchStatuspage(WINDSURF_STATUS),
      fetchClaudeCodeIssues(),
    ]);

  const data: StatusResult["data"] = {};

  // OpenAI incidents live on a separate endpoint — same array feeds all three
  // OpenAI-powered cards (API, Codex Web, Codex API). We attach the full
  // active list to each; filtering per-component would require inspecting
  // each incident's `components[]` and is a future refinement.
  const openaiActive: ToolIncident[] =
    openaiIncidents instanceof Error ? [] : openaiIncidents;
  if (openaiIncidents instanceof Error) {
    failures.push({
      toolId: "openai-api",
      sourceId: OPENAI_INCIDENTS.id,
      message: openaiIncidents.message,
    });
  }

  // Claude Code card: overall Anthropic status + claude-code issue count.
  if (anthropic instanceof Error) {
    failures.push({ toolId: "claude-code", sourceId: ANTHROPIC_STATUS.id, message: anthropic.message });
  } else {
    data["claude-code"] = {
      status: overallStatus(anthropic),
      statusSourceId: ANTHROPIC_STATUS.id,
      lastCheckedAt: polledAt,
      openIssues: claudeIssues instanceof Error ? undefined : claudeIssues,
      activeIncidents: activeIncidentsOf(anthropic),
    };
    if (claudeIssues instanceof Error) {
      failures.push({ toolId: "claude-code", sourceId: "gh-issues-claude-code", message: claudeIssues.message });
    }
  }

  // OpenAI API card: overall OpenAI status page + incidents feed.
  if (openai instanceof Error) {
    failures.push({ toolId: "openai-api", sourceId: OPENAI_STATUS.id, message: openai.message });
  } else {
    const status = overallStatus(openai);
    data["openai-api"] = {
      status,
      statusSourceId: OPENAI_STATUS.id,
      lastCheckedAt: polledAt,
      activeIncidents: openaiActive,
    };
    if (status === "unknown") {
      failures.push({
        toolId: "openai-api",
        sourceId: OPENAI_STATUS.id,
        message: `raw indicator="${openai.status?.indicator ?? "<missing>"}" page.name="${openai.page?.name ?? "<missing>"}"`,
      });
    }

    // Codex card: worst of Codex Web + Codex API components.
    const codexWeb = findComponent(openai, "Codex Web");
    const codexApi = findComponent(openai, "Codex API");
    const codexParts: StatuspageComponentStatus[] = [];
    if (codexWeb) codexParts.push(codexWeb);
    if (codexApi) codexParts.push(codexApi);
    if (codexParts.length === 0) {
      failures.push({
        toolId: "codex",
        sourceId: OPENAI_STATUS.id,
        message: "neither `Codex Web` nor `Codex API` component found on OpenAI status page",
      });
    } else {
      data["codex"] = {
        status: worstStatus(codexParts),
        statusSourceId: OPENAI_STATUS.id,
        lastCheckedAt: polledAt,
        activeIncidents: openaiActive,
      };
    }
  }

  // Copilot card: specific `Copilot` component from GitHub status.
  if (github instanceof Error) {
    failures.push({ toolId: "copilot", sourceId: GITHUB_STATUS.id, message: github.message });
  } else {
    data["copilot"] = {
      status: componentStatusByName(github, "Copilot"),
      statusSourceId: GITHUB_STATUS.id,
      lastCheckedAt: polledAt,
      activeIncidents: activeIncidentsOf(github),
    };
  }

  // Windsurf card: overall status.windsurf.com page.
  if (windsurf instanceof Error) {
    failures.push({ toolId: "windsurf", sourceId: WINDSURF_STATUS.id, message: windsurf.message });
  } else {
    data["windsurf"] = {
      status: overallStatus(windsurf),
      statusSourceId: WINDSURF_STATUS.id,
      lastCheckedAt: polledAt,
      activeIncidents: activeIncidentsOf(windsurf),
    };
  }

  return { data, polledAt, failures };
}
