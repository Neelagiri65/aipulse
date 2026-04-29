/**
 * Gawk — TOOL_ALERT deriver
 *
 * Pure function over `StatusResult`. Emits one Card per tool that the
 * StatusBar would render as anything other than green: a non-operational
 * status, OR an operational tool that has at least one active incident
 * on its status page. The incident-fold is the same trust invariant
 * `StatusBar.deriveSev` uses — keep them in sync, otherwise the
 * StatusBar can show "1 DEGRADED" while the feed has zero TOOL_ALERTs.
 *
 * sourceUrl + sourceName are read from `data-sources.ts` via the tool's
 * `statusSourceId`. Per CLAUDE.md trust contract — no fabricated copy,
 * no LLM, no scoring.
 */

import { getSourceById } from "@/lib/data-sources";
import type { StatusResult } from "@/lib/data/fetch-status";
import type { ToolId } from "@/components/health/tools";
import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";

const TOOL_DISPLAY_NAMES: Record<ToolId, string> = {
  "claude-code": "Claude Code",
  copilot: "GitHub Copilot",
  "openai-api": "OpenAI API",
  codex: "Codex",
  windsurf: "Windsurf",
  cursor: "Cursor",
};

const STATUS_DISPLAY: Record<string, string> = {
  degraded: "degraded performance",
  partial_outage: "a partial outage",
  major_outage: "a major outage",
};

export function deriveToolAlertCards(snapshot: StatusResult): Card[] {
  const cards: Card[] = [];
  for (const [toolId, health] of Object.entries(snapshot.data)) {
    if (!health) continue;
    if (health.status === "unknown") continue;

    const incidents = health.activeIncidents ?? [];
    const hasActiveIncident = incidents.length > 0;
    if (health.status === "operational" && !hasActiveIncident) continue;

    const source = getSourceById(health.statusSourceId);
    if (!source) continue;

    const displayName =
      TOOL_DISPLAY_NAMES[toolId as ToolId] ?? toolId;

    // When the upstream marks the tool operational but is mid-incident,
    // render the incident name instead of "operational" — same fold the
    // StatusBar applies. The headline still cites the upstream verbatim.
    const isOperationalWithIncident =
      health.status === "operational" && hasActiveIncident;
    const headline = isOperationalWithIncident
      ? `${displayName} has an active incident: ${incidents[0].name}`
      : `${displayName} is reporting ${
          STATUS_DISPLAY[health.status] ?? health.status.replace("_", " ")
        }`;
    const detail = isOperationalWithIncident
      ? `Status page is green but lists ${incidents.length} active incident${
          incidents.length === 1 ? "" : "s"
        } (${incidents[0].status}).`
      : `Upstream status page reports ${health.status}.`;

    const timestampMs = new Date(health.lastCheckedAt).getTime();
    const primaryKey = `${health.statusSourceId}:${toolId}`;

    cards.push({
      id: cardId("TOOL_ALERT", primaryKey, timestampMs),
      type: "TOOL_ALERT",
      severity: FEED_SEVERITIES.TOOL_ALERT,
      headline,
      detail,
      sourceName: source.name,
      sourceUrl: source.url,
      timestamp: health.lastCheckedAt,
      meta: {
        toolId,
        status: health.status,
        statusSourceId: health.statusSourceId,
        activeIncidents: incidents.length,
      },
    });
  }
  return cards;
}
