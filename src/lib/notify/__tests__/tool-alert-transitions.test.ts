import { describe, expect, it } from "vitest";
import {
  computeTransitions,
  primaryKeyFor,
  toolDisplayNameFromHeadline,
  type StateMap,
  type ToolAlertCard,
} from "@/lib/notify/tool-alert-transitions";
import { FEED_SEVERITIES } from "@/lib/feed/thresholds";

function makeCard(overrides: Partial<ToolAlertCard["meta"]> & {
  toolId: string;
  status: string;
  statusSourceId?: string;
  headline?: string;
  detail?: string;
  sourceUrl?: string;
  sourceName?: string;
  timestamp?: string;
}): ToolAlertCard {
  const sourceId = overrides.statusSourceId ?? "anthropic-status";
  const toolId = overrides.toolId;
  const displayName =
    toolId === "claude-code"
      ? "Claude Code"
      : toolId === "copilot"
        ? "GitHub Copilot"
        : toolId;
  return {
    id: `card_${toolId}`,
    type: "TOOL_ALERT",
    severity: FEED_SEVERITIES.TOOL_ALERT,
    headline:
      overrides.headline ??
      `${displayName} is reporting ${overrides.status.replace("_", " ")}`,
    detail: overrides.detail ?? `Upstream status page reports ${overrides.status}.`,
    sourceName: overrides.sourceName ?? "Anthropic Status",
    sourceUrl: overrides.sourceUrl ?? "https://status.claude.com",
    timestamp: overrides.timestamp ?? "2026-04-29T12:00:00.000Z",
    meta: {
      toolId,
      status: overrides.status,
      statusSourceId: sourceId,
      activeIncidents: 0,
    },
  };
}

describe("primaryKeyFor", () => {
  it("composes statusSourceId and toolId", () => {
    const card = makeCard({ toolId: "cursor", status: "degraded" });
    expect(primaryKeyFor(card)).toBe("anthropic-status:cursor");
  });
});

describe("toolDisplayNameFromHeadline", () => {
  it("strips the 'is reporting' tail", () => {
    expect(
      toolDisplayNameFromHeadline("Claude Code is reporting degraded performance"),
    ).toBe("Claude Code");
  });
  it("strips the 'has an active incident' tail", () => {
    expect(
      toolDisplayNameFromHeadline("Cursor has an active incident: API issues"),
    ).toBe("Cursor");
  });
  it("returns the headline unchanged when no marker matches", () => {
    expect(toolDisplayNameFromHeadline("Plain headline")).toBe("Plain headline");
  });
});

describe("computeTransitions — alerts", () => {
  it("emits one alert per current card when previous state is empty", () => {
    const cards = [
      makeCard({ toolId: "cursor", status: "degraded" }),
      makeCard({ toolId: "copilot", status: "major_outage", statusSourceId: "github-status" }),
    ];
    const { alerts, recoveries, nextState } = computeTransitions(cards, {});
    expect(alerts).toHaveLength(2);
    expect(recoveries).toEqual([]);
    expect(Object.keys(nextState)).toHaveLength(2);
    expect(alerts[0].previousStatus).toBeUndefined();
  });

  it("does NOT re-fire on a second tick when the status is unchanged", () => {
    const card = makeCard({ toolId: "cursor", status: "degraded" });
    const previous: StateMap = {
      [primaryKeyFor(card)]: {
        status: "degraded",
        alertedAt: "2026-04-29T11:00:00.000Z",
        sourceUrl: card.sourceUrl,
        sourceName: card.sourceName,
        toolDisplayName: "Cursor",
      },
    };
    const { alerts, recoveries } = computeTransitions([card], previous);
    expect(alerts).toEqual([]);
    expect(recoveries).toEqual([]);
  });

  it("re-fires when the status escalates (degraded → major_outage)", () => {
    const newCard = makeCard({ toolId: "cursor", status: "major_outage" });
    const previous: StateMap = {
      [primaryKeyFor(newCard)]: {
        status: "degraded",
        alertedAt: "2026-04-29T11:00:00.000Z",
        sourceUrl: newCard.sourceUrl,
        sourceName: newCard.sourceName,
        toolDisplayName: "Cursor",
      },
    };
    const { alerts } = computeTransitions([newCard], previous);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].previousStatus).toBe("degraded");
    expect(String(alerts[0].card.meta.status)).toBe("major_outage");
  });

  it("preserves the original alertedAt across an unchanged tick", () => {
    const card = makeCard({ toolId: "cursor", status: "degraded" });
    const previous: StateMap = {
      [primaryKeyFor(card)]: {
        status: "degraded",
        alertedAt: "2026-04-29T11:00:00.000Z",
        sourceUrl: card.sourceUrl,
        sourceName: card.sourceName,
        toolDisplayName: "Cursor",
      },
    };
    const { nextState } = computeTransitions([card], previous);
    expect(nextState[primaryKeyFor(card)].alertedAt).toBe(
      "2026-04-29T11:00:00.000Z",
    );
  });
});

describe("computeTransitions — recoveries", () => {
  it("emits one recovery per cached entry that is no longer in current cards", () => {
    const cached: StateMap = {
      "anthropic-status:cursor": {
        status: "degraded",
        alertedAt: "2026-04-29T11:00:00.000Z",
        sourceUrl: "https://status.claude.com",
        sourceName: "Anthropic Status",
        toolDisplayName: "Cursor",
      },
    };
    const { alerts, recoveries, nextState } = computeTransitions([], cached);
    expect(alerts).toEqual([]);
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0].state.status).toBe("degraded");
    expect(recoveries[0].state.toolDisplayName).toBe("Cursor");
    // Recovered key must NOT be in nextState (the route then HDELs it).
    expect(nextState["anthropic-status:cursor"]).toBeUndefined();
  });

  it("emits both alert and recovery in the same tick (Cursor down, Copilot up)", () => {
    const cards = [makeCard({ toolId: "cursor", status: "degraded" })];
    const cached: StateMap = {
      "github-status:copilot": {
        status: "major_outage",
        alertedAt: "2026-04-29T10:00:00.000Z",
        sourceUrl: "https://www.githubstatus.com",
        sourceName: "GitHub Status",
        toolDisplayName: "GitHub Copilot",
      },
    };
    const { alerts, recoveries } = computeTransitions(cards, cached);
    expect(alerts).toHaveLength(1);
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0].state.toolDisplayName).toBe("GitHub Copilot");
  });
});
