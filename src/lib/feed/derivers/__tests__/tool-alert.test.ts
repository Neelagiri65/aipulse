import { describe, expect, it } from "vitest";
import { deriveToolAlertCards } from "@/lib/feed/derivers/tool-alert";
import type { StatusResult } from "@/lib/data/fetch-status";

const baseSnapshot: StatusResult = {
  data: {},
  polledAt: "2026-04-27T12:00:00.000Z",
  failures: [],
};

describe("deriveToolAlertCards", () => {
  it("returns no cards when every component is operational", () => {
    const snapshot: StatusResult = {
      ...baseSnapshot,
      data: {
        "claude-code": {
          status: "operational",
          statusSourceId: "anthropic-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
        "openai-api": {
          status: "operational",
          statusSourceId: "openai-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
      },
    };
    expect(deriveToolAlertCards(snapshot)).toEqual([]);
  });

  it("emits a TOOL_ALERT card for each non-operational tool", () => {
    const snapshot: StatusResult = {
      ...baseSnapshot,
      data: {
        "claude-code": {
          status: "major_outage",
          statusSourceId: "anthropic-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
        "openai-api": {
          status: "operational",
          statusSourceId: "openai-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
        copilot: {
          status: "degraded",
          statusSourceId: "github-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
      },
    };
    const cards = deriveToolAlertCards(snapshot);
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.type).toBe("TOOL_ALERT");
      expect(card.severity).toBe(100);
      expect(card.sourceUrl).toMatch(/^https:\/\//);
      expect(card.id).toMatch(/^TOOL_ALERT-/);
    }
  });

  it("populates the source URL from data-sources.ts (Anthropic)", () => {
    const snapshot: StatusResult = {
      ...baseSnapshot,
      data: {
        "claude-code": {
          status: "partial_outage",
          statusSourceId: "anthropic-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
      },
    };
    const cards = deriveToolAlertCards(snapshot);
    expect(cards[0].sourceUrl).toBe("https://status.claude.com");
    expect(cards[0].sourceName).toBe("Anthropic Status (Claude Code + API)");
  });

  it("uses lastCheckedAt as the card timestamp, not the polledAt envelope", () => {
    const snapshot: StatusResult = {
      ...baseSnapshot,
      polledAt: "2026-04-27T12:00:00.000Z",
      data: {
        "claude-code": {
          status: "major_outage",
          statusSourceId: "anthropic-status",
          lastCheckedAt: "2026-04-27T11:30:00.000Z",
        },
      },
    };
    const cards = deriveToolAlertCards(snapshot);
    expect(cards[0].timestamp).toBe("2026-04-27T11:30:00.000Z");
  });

  it("treats unknown status as a non-event (no card)", () => {
    const snapshot: StatusResult = {
      ...baseSnapshot,
      data: {
        "claude-code": {
          status: "unknown",
          statusSourceId: "anthropic-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
      },
    };
    expect(deriveToolAlertCards(snapshot)).toEqual([]);
  });

  it("respects the per-deriver sanity bound (≤ 7 cards)", () => {
    const snapshot: StatusResult = {
      ...baseSnapshot,
      data: {
        "claude-code": {
          status: "degraded",
          statusSourceId: "anthropic-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
        "openai-api": {
          status: "degraded",
          statusSourceId: "openai-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
        codex: {
          status: "degraded",
          statusSourceId: "openai-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
        copilot: {
          status: "degraded",
          statusSourceId: "github-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
        windsurf: {
          status: "degraded",
          statusSourceId: "windsurf-status",
          lastCheckedAt: "2026-04-27T12:00:00.000Z",
        },
      },
    };
    expect(deriveToolAlertCards(snapshot).length).toBeLessThanOrEqual(7);
  });
});
