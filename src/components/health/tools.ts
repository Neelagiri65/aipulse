import { getSourceById } from "@/lib/data-sources";
import type { DayBucket } from "@/lib/data/status-history";

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
  /**
   * 7-day daily buckets (oldest → newest), each showing worst status for that
   * day. Built from the status page's historical incidents feed merged with
   * any Redis-stored poll samples. Undefined when neither source is available
   * (e.g. cursor has no source at all).
   */
  history?: DayBucket[];
  /** Whether Redis poll samples are feeding the history. False → incidents only. */
  historyHasSamples?: boolean;
  /** ISO timestamp of last time we successfully polled this tool's status. */
  lastCheckedAt: string;
  /** ISO timestamp of the last known good reading if current poll failed. */
  lastKnownAt?: string;
};

export type ToolId =
  | "claude-code"
  | "copilot"
  | "openai-api"
  | "codex"
  | "windsurf"
  | "cursor";

export type ToolConfig = {
  id: ToolId;
  name: string;
  subtitle: string;
  /** Source IDs this card relies on (in descending priority). Empty for no-data cards. */
  sourceIds: string[];
  /**
   * False when the upstream status page does not expose an `incidents` array
   * via any endpoint we can consume. We surface this on the card so a green
   * pill is not silently hiding an unresolved incident the user could read on
   * the public status page.
   */
  incidentsApiAvailable: boolean;
  /**
   * True when no verifiable public source exists for this tool. The card
   * renders an explicit "no public source" body rather than fabricating a
   * status pill. Currently only Cursor.
   */
  noPublicSource?: boolean;
  /**
   * Public page the user can visit to see status manually. Used on no-data
   * cards and as a fallback citation link.
   */
  publicPageUrl?: string;
  /**
   * Short explanation shown on no-data cards. Why the card exists despite
   * lacking a verifiable source (so the gap is visible, not hidden).
   */
  noSourceReason?: string;
};

// Tool registry — order reflects card layout priority.
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
    // summary.json → status; incidents.json → active incidents. Both verified.
    sourceIds: ["openai-status", "openai-incidents"],
    incidentsApiAvailable: true,
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    subtitle: "OpenAI · Codex Web + Codex API",
    sourceIds: ["openai-status", "openai-incidents"],
    incidentsApiAvailable: true,
  },
  {
    id: "windsurf",
    name: "Windsurf",
    subtitle: "Windsurf · IDE (formerly Codeium)",
    sourceIds: ["windsurf-status"],
    incidentsApiAvailable: true,
  },
  {
    id: "cursor",
    name: "Cursor",
    subtitle: "Anysphere · IDE",
    sourceIds: [],
    incidentsApiAvailable: false,
    noPublicSource: true,
    publicPageUrl: "https://status.cursor.com",
    noSourceReason:
      "No public status API and no public GitHub issue tracker. Card is surfaced so the gap is visible, not hidden.",
  },
] as const;

/** True when every source this card depends on is verified in data-sources.ts. */
export function allSourcesVerified(tool: ToolConfig): boolean {
  if (tool.sourceIds.length === 0) return false;
  return tool.sourceIds.every((id) => {
    const src = getSourceById(id);
    return src !== undefined && src.verifiedAt !== "";
  });
}

/** Primary (status) source URL for the citation link. */
export function primarySourceUrl(tool: ToolConfig): string | undefined {
  if (tool.sourceIds.length === 0) return tool.publicPageUrl;
  const src = getSourceById(tool.sourceIds[0]);
  return src?.url;
}
