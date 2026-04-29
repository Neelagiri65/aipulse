import { describe, expect, it } from "vitest";

import {
  panelForCardType,
  pickTopHighlights,
  toneForSeverity,
} from "@/lib/feed/highlights";
import type { Card, FeedResponse } from "@/lib/feed/types";

function card(
  partial: Pick<Card, "id" | "type" | "severity" | "headline" | "timestamp"> &
    Partial<Card>,
): Card {
  return {
    sourceName: partial.sourceName ?? "test-source",
    sourceUrl: partial.sourceUrl ?? "https://example.com",
    meta: partial.meta ?? {},
    ...partial,
  };
}

const baseCurrentState = {
  topModel: { name: "anthropic/claude-sonnet-4.6", sourceUrl: "https://x" },
  toolHealth: { operational: 5, degraded: 0, total: 5 },
  latestPaper: { title: "p", sourceUrl: "https://y" },
};

function feed(cards: Card[], opts: Partial<FeedResponse> = {}): FeedResponse {
  return {
    cards,
    quietDay: false,
    currentState: baseCurrentState,
    lastComputed: "2026-04-29T12:00:00.000Z",
    ...opts,
  };
}

describe("pickTopHighlights", () => {
  it("returns an empty list when the response is undefined", () => {
    expect(pickTopHighlights(undefined)).toEqual([]);
  });

  it("returns an empty list on a quiet day even if cards exist", () => {
    const cards = [
      card({
        id: "1",
        type: "TOOL_ALERT",
        severity: 100,
        headline: "X",
        timestamp: "2026-04-29T11:00:00.000Z",
      }),
    ];
    expect(pickTopHighlights(feed(cards, { quietDay: true }))).toEqual([]);
  });

  it("prefers distinct types before falling back to severity within a type", () => {
    // Pass 1 picks the top card of each type (severity-desc). With
    // 3 types available (TOOL_ALERT / MODEL_MOVER / RESEARCH) the
    // top-3 should be one of each rather than two MODEL_MOVERs and
    // one TOOL_ALERT — even though the second MODEL_MOVER outranks
    // the RESEARCH card on severity.
    const cards = [
      card({
        id: "low",
        type: "RESEARCH",
        severity: 20,
        headline: "old paper",
        timestamp: "2026-04-29T10:00:00.000Z",
      }),
      card({
        id: "tool",
        type: "TOOL_ALERT",
        severity: 100,
        headline: "GitHub Copilot degraded",
        timestamp: "2026-04-29T11:00:00.000Z",
      }),
      card({
        id: "model-old",
        type: "MODEL_MOVER",
        severity: 80,
        headline: "Kimi K2.6 +5",
        timestamp: "2026-04-29T09:00:00.000Z",
      }),
      card({
        id: "model-new",
        type: "MODEL_MOVER",
        severity: 80,
        headline: "Sonnet 4.6 +4",
        timestamp: "2026-04-29T10:30:00.000Z",
      }),
    ];
    const result = pickTopHighlights(feed(cards));
    expect(result.map((h) => h.card.id)).toEqual([
      "tool",
      "model-new", // newest MODEL_MOVER beats older one in pass 1
      "low", // distinct RESEARCH type chosen over second MODEL_MOVER
    ]);
  });

  it("falls back to severity order when fewer distinct types than slots", () => {
    // Only 2 types available — pass 1 picks one of each, pass 2 fills
    // the third slot from severity-desc leftovers.
    const cards = [
      card({
        id: "tool",
        type: "TOOL_ALERT",
        severity: 100,
        headline: "Copilot degraded",
        timestamp: "2026-04-29T11:00:00.000Z",
      }),
      card({
        id: "model-old",
        type: "MODEL_MOVER",
        severity: 80,
        headline: "old",
        timestamp: "2026-04-29T09:00:00.000Z",
      }),
      card({
        id: "model-new",
        type: "MODEL_MOVER",
        severity: 80,
        headline: "new",
        timestamp: "2026-04-29T10:30:00.000Z",
      }),
    ];
    const result = pickTopHighlights(feed(cards));
    expect(result.map((h) => h.card.id)).toEqual([
      "tool",
      "model-new",
      "model-old", // pass 2 leftover
    ]);
  });

  it("respects the limit argument", () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      card({
        id: `c${i}`,
        type: "TOOL_ALERT",
        severity: 100,
        headline: `H ${i}`,
        timestamp: `2026-04-29T1${i}:00:00.000Z`,
      }),
    );
    expect(pickTopHighlights(feed(cards), 1)).toHaveLength(1);
    expect(pickTopHighlights(feed(cards), 2)).toHaveLength(2);
  });

  it("attaches the destination panel and tone for each picked card", () => {
    const cards = [
      card({
        id: "tool",
        type: "TOOL_ALERT",
        severity: 100,
        headline: "x",
        timestamp: "2026-04-29T11:00:00.000Z",
      }),
      card({
        id: "sdk",
        type: "SDK_TREND",
        severity: 60,
        headline: "y",
        timestamp: "2026-04-29T10:00:00.000Z",
      }),
    ];
    const [tool, sdk] = pickTopHighlights(feed(cards));
    expect(tool.panel).toBe("tools");
    expect(tool.tone).toBe("outage");
    expect(sdk.panel).toBe("sdk-adoption");
    expect(sdk.tone).toBe("degrade");
  });
});

describe("panelForCardType", () => {
  it("maps every CardType to a panel", () => {
    expect(panelForCardType("TOOL_ALERT")).toBe("tools");
    expect(panelForCardType("MODEL_MOVER")).toBe("model-usage");
    expect(panelForCardType("SDK_TREND")).toBe("sdk-adoption");
    expect(panelForCardType("NEWS")).toBe("wire");
    expect(panelForCardType("RESEARCH")).toBe("research");
    expect(panelForCardType("LAB_HIGHLIGHT")).toBe("labs");
  });
});

describe("toneForSeverity", () => {
  it("buckets severities into the four presentational tones", () => {
    expect(toneForSeverity(100)).toBe("outage");
    expect(toneForSeverity(80)).toBe("degrade");
    expect(toneForSeverity(60)).toBe("degrade");
    expect(toneForSeverity(40)).toBe("info");
    expect(toneForSeverity(20)).toBe("neutral");
    expect(toneForSeverity(10)).toBe("neutral");
  });
});
