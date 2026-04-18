/**
 * Adapter for Statuspage.io v2 summary responses — the schema used by
 * Anthropic, OpenAI, and GitHub status pages. Maps a raw summary into
 * the slice of ToolHealthData we render on each card.
 */

import type { ToolHealthStatus } from "@/components/health/tools";

export type StatuspageIndicator = "none" | "minor" | "major" | "critical";

export type StatuspageComponentStatus =
  | "operational"
  | "degraded_performance"
  | "partial_outage"
  | "major_outage"
  | "under_maintenance";

export type StatuspageSummary = {
  page?: { id: string; name: string; url: string; updated_at: string };
  status?: { indicator: StatuspageIndicator; description: string };
  components?: Array<{
    id: string;
    name: string;
    status: StatuspageComponentStatus;
    updated_at?: string;
  }>;
  incidents?: Array<{ id: string; name: string; status: string; created_at: string }>;
};

export function indicatorToStatus(indicator: StatuspageIndicator): ToolHealthStatus {
  switch (indicator) {
    case "none":
      return "operational";
    case "minor":
      return "degraded";
    case "major":
      return "partial_outage";
    case "critical":
      return "major_outage";
    default:
      return "unknown";
  }
}

export function componentStatusToToolStatus(
  status: StatuspageComponentStatus,
): ToolHealthStatus {
  switch (status) {
    case "operational":
      return "operational";
    case "degraded_performance":
      return "degraded";
    case "partial_outage":
      return "partial_outage";
    case "major_outage":
      return "major_outage";
    case "under_maintenance":
      return "degraded";
    default:
      return "unknown";
  }
}

/**
 * Pick the status of a specific named component from a summary. Returns
 * `unknown` if the component isn't present — callers should treat this as
 * a source drift and fall through to graceful degradation.
 */
export function componentStatusByName(
  summary: StatuspageSummary,
  componentName: string,
): ToolHealthStatus {
  const component = summary.components?.find(
    (c) => c.name.toLowerCase() === componentName.toLowerCase(),
  );
  if (!component) return "unknown";
  return componentStatusToToolStatus(component.status);
}

/**
 * The overall page-level status. Use when the tool IS the page (e.g.
 * OpenAI API maps to the OpenAI status page as a whole).
 */
export function overallStatus(summary: StatuspageSummary): ToolHealthStatus {
  if (!summary.status) return "unknown";
  return indicatorToStatus(summary.status.indicator);
}
