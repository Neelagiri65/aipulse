/**
 * The cached alert state carries the tool id from the card, so a recovery
 * push can be targeted like the alert was. Legacy states (no toolId) are
 * carried forward untouched and resolved by the push-payload builder.
 */
import { describe, expect, it } from "vitest";
import { computeTransitions, primaryKeyFor, type StateMap, type ToolAlertCard } from "@/lib/notify/tool-alert-transitions";

const card = (toolId: string, status: string): ToolAlertCard => ({
  id: `TOOL_ALERT-${toolId}`,
  type: "TOOL_ALERT",
  severity: 100,
  headline: `${toolId} is reporting ${status}`,
  detail: "d",
  sourceName: "s",
  sourceUrl: "https://s.example",
  timestamp: "2026-09-15T12:00:00.000Z",
  meta: { toolId, status, statusSourceId: `${toolId}-status`, activeIncidents: 0 },
});

describe("computeTransitions × toolId", () => {
  it("writes the card's tool id into the next state", () => {
    const c = card("cursor", "degraded");
    const { nextState } = computeTransitions([c], {});
    expect(nextState[primaryKeyFor(c)].toolId).toBe("cursor");
  });

  it("a legacy cached state with no toolId gains one on the next tick while the alert is open", () => {
    const c = card("codex", "degraded");
    const previous: StateMap = {
      [primaryKeyFor(c)]: { status: "degraded", alertedAt: "2026-09-15T11:00:00Z", sourceUrl: "u", sourceName: "n", toolDisplayName: "Codex" },
    };
    const { alerts, nextState } = computeTransitions([c], previous);
    expect(alerts).toEqual([]);
    expect(nextState[primaryKeyFor(c)].toolId).toBe("codex");
  });

  it("a recovery hands back the cached state, so a legacy state recovers without a toolId (the payload builder falls back to the key)", () => {
    const key = "codex-status:codex";
    const previous: StateMap = {
      [key]: { status: "degraded", alertedAt: "2026-09-15T11:00:00Z", sourceUrl: "u", sourceName: "n", toolDisplayName: "Codex" },
    };
    const { recoveries } = computeTransitions([], previous);
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0].primaryKey).toBe(key);
    expect(recoveries[0].state.toolId).toBeUndefined();
  });
});
