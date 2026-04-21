/**
 * Tool Health digest section composer.
 *
 * Two signals feed this section:
 *   1. `incidents24h` — the authoritative record from Statuspage of
 *      incidents that overlapped the last 24 hours. Any incident here
 *      is enough to take the section out of "quiet".
 *   2. Today's vs yesterday's `snapshot.tools` — transitions between
 *      operational / degraded / partial_outage / major_outage for any
 *      tracked tool. Status changes are additive to incidents — a tool
 *      can flip status without a filed incident (Statuspage lag) and
 *      still deserves a mention.
 *
 * Bootstrap mode (yesterday is null): current status of each tracked
 * tool, no transition language.
 *
 * Quiet mode: no 24h incidents AND no status transitions. Renders a
 * one-line "All tools operational, no incidents" headline with a tiled
 * current-state list underneath (for visual continuity — an empty
 * section looks broken).
 */

import type { SnapshotTool } from "@/lib/data/snapshot";
import type { HistoricalIncident } from "@/lib/data/status-history";
import type { DigestSection, DigestSectionItem } from "@/lib/digest/types";

const STATUS_LABEL: Record<string, string> = {
  operational: "Operational",
  degraded: "Degraded",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
  unknown: "Unknown",
};

const TOOL_STATUS_PAGES: Record<string, string> = {
  openai: "https://status.openai.com/",
  anthropic: "https://status.anthropic.com/",
  github: "https://www.githubstatus.com/",
  npm: "https://status.npmjs.org/",
};

function statusPageFor(toolId: string): string {
  return TOOL_STATUS_PAGES[toolId] ?? `https://status.${toolId}.com/`;
}

function displayName(toolId: string): string {
  switch (toolId) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "github":
      return "GitHub";
    case "npm":
      return "npm";
    default:
      return toolId;
  }
}

export type ComposeToolHealthInput = {
  todayTools: SnapshotTool[];
  yesterdayTools: SnapshotTool[] | null;
  incidents24h: HistoricalIncident[];
};

export function composeToolHealthSection(
  input: ComposeToolHealthInput,
): DigestSection {
  const { todayTools, yesterdayTools, incidents24h } = input;

  const items: DigestSectionItem[] = [];
  const sourceUrls = new Set<string>();

  // 1. Incidents first — they're the authoritative record.
  for (const inc of incidents24h) {
    const impactLabel = inc.impact === "none" ? "reported" : inc.impact;
    items.push({
      headline: inc.name,
      detail: `${impactLabel}${
        inc.resolvedAt ? " · resolved" : " · ongoing"
      }`,
      sourceLabel: "Statuspage",
    });
  }

  // 2. Status transitions (diff mode only).
  const yesterdayById = new Map(
    (yesterdayTools ?? []).map((t) => [t.id, t]),
  );
  const isDiff = yesterdayTools !== null;
  if (isDiff) {
    for (const today of todayTools) {
      const yest = yesterdayById.get(today.id);
      if (!yest) continue;
      if (yest.status !== today.status) {
        items.push({
          headline: `${displayName(today.id)}: ${
            STATUS_LABEL[yest.status] ?? yest.status
          } → ${STATUS_LABEL[today.status] ?? today.status}`,
          sourceLabel: "Statuspage",
          sourceUrl: statusPageFor(today.id),
        });
        sourceUrls.add(statusPageFor(today.id));
      }
    }
  }

  const hasMovement = items.length > 0;

  // 3. When bootstrap OR quiet, include a current-state tile list so the
  //    section is never empty.
  if (!hasMovement || !isDiff) {
    for (const t of todayTools) {
      items.push({
        headline: displayName(t.id),
        detail: `${STATUS_LABEL[t.status] ?? t.status}${
          t.activeIncidents > 0
            ? ` · ${t.activeIncidents} active incident${t.activeIncidents === 1 ? "" : "s"}`
            : ""
        }`,
        sourceLabel: "Statuspage",
        sourceUrl: statusPageFor(t.id),
      });
      sourceUrls.add(statusPageFor(t.id));
    }
  }

  const mode = !isDiff ? "bootstrap" : hasMovement ? "diff" : "quiet";

  const headline =
    mode === "bootstrap"
      ? `Current status of ${todayTools.length} tracked tools`
      : mode === "quiet"
        ? "All tools operational, no incidents in the last 24h"
        : incidents24h.length > 0
          ? `${incidents24h.length} incident${incidents24h.length === 1 ? "" : "s"} in the last 24h`
          : "Status changes in the last 24h";

  return {
    id: "tool-health",
    title: "Tool Health",
    anchorSlug: "tool-health",
    mode,
    headline,
    items,
    sourceUrls: Array.from(sourceUrls),
  };
}
