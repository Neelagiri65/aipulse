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

/** Snapshot of a tool's current health. Always cites the source it came from. */
export type ToolHealthData = {
  status: ToolHealthStatus;
  /** ID of the source in data-sources.ts. Must be `verified` for this to render live. */
  statusSourceId: string;
  uptimePct30d?: number;
  version?: string;
  openIssues?: number;
  sentiment?: ToolSentiment;
  /** ISO timestamp of last time we successfully polled this tool's status. */
  lastCheckedAt: string;
  /** ISO timestamp of the last known good reading if current poll failed. */
  lastKnownAt?: string;
};

export type ToolConfig = {
  id: "claude-code" | "cursor" | "copilot" | "openai-api";
  name: string;
  subtitle: string;
  /** Source IDs this card relies on (in descending priority). */
  sourceIds: string[];
};

export const TOOLS: readonly ToolConfig[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    subtitle: "Anthropic · CLI",
    sourceIds: ["anthropic-status", "gh-issues-claude-code"],
  },
  {
    id: "cursor",
    name: "Cursor",
    subtitle: "Anysphere · IDE",
    sourceIds: ["cursor-status"],
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    subtitle: "GitHub · IDE extension",
    sourceIds: ["github-status"],
  },
  {
    id: "openai-api",
    name: "OpenAI API",
    subtitle: "OpenAI · hosted models",
    sourceIds: ["openai-status"],
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
