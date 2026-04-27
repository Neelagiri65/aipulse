/**
 * AI Pulse — TOOL_ALERT deriver
 *
 * Pure function over `StatusResult`. Emits one Card per tool whose
 * upstream status is anything other than `operational` or `unknown`.
 * sourceUrl + sourceName are read from `data-sources.ts` via the
 * tool's `statusSourceId`. Per CLAUDE.md trust contract — no
 * fabricated copy, no LLM, no scoring.
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
    if (health.status === "operational") continue;
    if (health.status === "unknown") continue;
    const source = getSourceById(health.statusSourceId);
    if (!source) continue;

    const displayName =
      TOOL_DISPLAY_NAMES[toolId as ToolId] ?? toolId;
    const statusPhrase =
      STATUS_DISPLAY[health.status] ?? health.status.replace("_", " ");
    const timestampMs = new Date(health.lastCheckedAt).getTime();
    const primaryKey = `${health.statusSourceId}:${toolId}`;

    cards.push({
      id: cardId("TOOL_ALERT", primaryKey, timestampMs),
      type: "TOOL_ALERT",
      severity: FEED_SEVERITIES.TOOL_ALERT,
      headline: `${displayName} is reporting ${statusPhrase}`,
      detail: `Upstream status page reports ${health.status}.`,
      sourceName: source.name,
      sourceUrl: source.url,
      timestamp: health.lastCheckedAt,
      meta: {
        toolId,
        status: health.status,
        statusSourceId: health.statusSourceId,
      },
    });
  }
  return cards;
}
