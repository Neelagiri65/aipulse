import { getSourceById } from "@/lib/data-sources";

export type ToolHealthStatus =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "unknown";

export type ToolSentiment = {
  positive: number;
  neutral: number;
  negative: number;
  sampleSize: number;
  windowHours: number;
};

/**
 * An unresolved incident from the upstream status page. We surface these even
 * when the per-component status reads "operational" — Statuspage marks
 * components green during the `monitoring` phase, but the incident itself is
 * still open and worth showing.
 */
export type ToolIncident = {
  id: string;
  name: string;
  /** Statuspage incident lifecycle: investigating | identified | monitoring */
  status: string;
  createdAt: string;
};

/** Snapshot of a tool's current health. Always cites the source it came from. */
export type ToolHealthData = {
  status: ToolHealthStatus;
  /** ID of the source in data-sources.ts. Must be `verified` for this to render live. */
  statusSourceId: string;
  uptimePct30d?: number;
  version?: string;
  openIssues?: number;
  sentiment?: ToolSentiment;
  /** Active incidents from the status page (not in resolved/postmortem). */
  activeIncidents?: ToolIncident[];
  /** ISO timestamp of last time we successfully polled this tool's status. */
  lastCheckedAt: string;
  /** ISO timestamp of the last known good reading if current poll failed. */
  lastKnownAt?: string;
};

export type ToolConfig = {
  id: "claude-code" | "copilot" | "openai-api";
  name: string;
  subtitle: string;
  /** Source IDs this card relies on (in descending priority). */
  sourceIds: string[];
  /**
   * False when the upstream status page does not expose an `incidents` array
   * in its JSON API. We surface this on the card so a green pill is not
   * silently hiding an unresolved incident the user could read on the public
   * status page (e.g. OpenAI moved off Statuspage to a custom page that only
   * exposes per-component status).
   */
  incidentsApiAvailable: boolean;
};

// Cursor intentionally omitted 2026-04-18 — no confirmed public status page.
// Will be reinstated only when a verified endpoint is found.
export const TOOLS: readonly ToolConfig[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    subtitle: "Anthropic · CLI",
    sourceIds: ["anthropic-status", "gh-issues-claude-code"],
    incidentsApiAvailable: true,
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    subtitle: "GitHub · IDE extension",
    sourceIds: ["github-status"],
    incidentsApiAvailable: true,
  },
  {
    id: "openai-api",
    name: "OpenAI API",
    subtitle: "OpenAI · hosted models",
    sourceIds: ["openai-status"],
    // status.openai.com is a custom Next.js page (not Statuspage.io). Its
    // summary.json exposes per-component status only — no `incidents` array.
    // We mark this honestly on the card so users know to check the public
    // page for any ongoing incident the JSON can't show us.
    incidentsApiAvailable: false,
  },
] as const;

/** True when every source this card depends on is verified in data-sources.ts. */
export function allSourcesVerified(tool: ToolConfig): boolean {
  return tool.sourceIds.every((id) => {
    const src = getSourceById(id);
    return src !== undefined && src.verifiedAt !== "";
  });
}

/** Primary (status) source URL for the citation link. */
export function primarySourceUrl(tool: ToolConfig): string | undefined {
  const src = getSourceById(tool.sourceIds[0]);
  return src?.url;
}
