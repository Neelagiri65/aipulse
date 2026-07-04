import { describe, expect, it } from "vitest";

import type { Card, FeedResponse } from "@/lib/feed/types";

import { applyContainment, STATE_STALE_MS } from "../apply";
import type { ContainmentState, SourceContainment } from "../types";

const NOW = Date.parse("2026-07-04T12:00:00Z");

function card(type: Card["type"], id: string): Card {
  return {
    id,
    type,
    severity: 60,
    headline: `${type} headline`,
    sourceName: type === "MODEL_MOVER" ? "OpenRouter" : "PyPI",
    sourceUrl: "https://example.test",
    timestamp: new Date(NOW).toISOString(),
    meta: {},
  };
}

function feed(): FeedResponse {
  return {
    cards: [
      card("MODEL_MOVER", "m1"),
      card("SDK_TREND", "s1"),
      card("NEWS", "n1"),
    ],
    quietDay: false,
    currentState: {
      topModel: { name: "gpt-6", sourceUrl: "https://openrouter.ai/gpt-6" },
      toolHealth: { operational: 3, degraded: 0, total: 3 },
      latestPaper: { title: "t", sourceUrl: "https://arxiv.org" },
    },
    lastComputed: new Date(NOW).toISOString(),
  };
}

function rec(overrides: Partial<SourceContainment>): SourceContainment {
  return {
    state: "live",
    consecutivePasses: 0,
    consecutiveFails: 0,
    enteredAt: NOW,
    reason: "",
    lastProbeAt: NOW,
    lastGoodAt: NOW,
    lastPassKey: "2026-07-04T09:00:00.000Z",
    ...overrides,
  };
}

function state(
  sources: Record<string, SourceContainment>,
  computedAt = NOW - 60_000,
): ContainmentState {
  return { schemaVersion: 1, computedAt, sources };
}

describe("applyContainment", () => {
  it("all-LIVE state changes nothing — no disclosures, no suppression", () => {
    const out = applyContainment(
      feed(),
      { state: state({ "openrouter-rankings": rec({}) }), error: false },
      NOW,
    );
    expect(out.cards).toHaveLength(3);
    expect(out.containedSources).toBeUndefined();
    expect(out.monitoringImpaired).toBeUndefined();
    expect(out.currentState.topModel.name).toBe("gpt-6");
  });

  it("SUSPECT and RECOVERING actuate NOTHING (hysteresis gates actuation only)", () => {
    for (const s of ["suspect", "recovering"] as const) {
      const out = applyContainment(
        feed(),
        {
          state: state({
            "openrouter-rankings": rec({ state: s, reason: "stale" }),
          }),
          error: false,
        },
        NOW,
      );
      expect(out.cards).toHaveLength(3);
      expect(out.containedSources).toBeUndefined();
    }
  });

  it("QUARANTINED openrouter suppresses MODEL_MOVER cards, blanks the ticker, discloses reasons + last-known", () => {
    const out = applyContainment(
      feed(),
      {
        state: state({
          "openrouter-rankings": rec({
            state: "quarantined",
            reason: "sanity: 400 above max 150",
          }),
        }),
        error: false,
      },
      NOW,
    );
    expect(out.cards.map((c) => c.type)).toEqual(["SDK_TREND", "NEWS"]);
    expect(out.currentState.topModel.name).toBe("—");
    expect(out.containedSources).toEqual([
      {
        source: "OpenRouter",
        reasons: ["sanity: 400 above max 150"],
        lastKnownAt: "2026-07-04T09:00:00.000Z",
      },
    ]);
  });

  it("QUARANTINED sdk-adoption suppresses SDK_TREND but leaves the ticker's topModel alone", () => {
    const out = applyContainment(
      feed(),
      {
        state: state({
          "sdk-adoption": rec({ state: "quarantined", reason: "stale" }),
        }),
        error: false,
      },
      NOW,
    );
    expect(out.cards.map((c) => c.type)).toEqual(["MODEL_MOVER", "NEWS"]);
    expect(out.currentState.topModel.name).toBe("gpt-6");
    expect(out.containedSources?.[0].source).toBe("SDK registries");
  });

  it("a source with NO trustworthy value ever observed discloses lastKnownAt null", () => {
    const out = applyContainment(
      feed(),
      {
        state: state({
          "openrouter-rankings": rec({
            state: "quarantined",
            reason: "provenance: records missing sourceUrl",
            lastPassKey: null,
            lastGoodAt: null,
          }),
        }),
        error: false,
      },
      NOW,
    );
    expect(out.containedSources?.[0].lastKnownAt).toBeNull();
  });

  it("missing or unreadable containment state serves as-is with the ADDITIVE monitoring badge", () => {
    for (const read of [
      { state: null, error: false },
      { state: null, error: true },
    ]) {
      const out = applyContainment(feed(), read, NOW);
      expect(out.cards).toHaveLength(3);
      expect(out.monitoringImpaired).toBe(true);
      expect(out.containedSources).toBeUndefined();
    }
  });

  it("STALE state stays STICKY: standing quarantines still actuate, badge added on top", () => {
    const staleComputedAt = NOW - STATE_STALE_MS - 1;
    const out = applyContainment(
      feed(),
      {
        state: state(
          {
            "openrouter-rankings": rec({
              state: "quarantined",
              reason: "sanity breach",
            }),
          },
          staleComputedAt,
        ),
        error: false,
      },
      NOW,
    );
    // The quarantine did NOT lift just because monitoring died (F5).
    expect(out.cards.map((c) => c.type)).toEqual(["SDK_TREND", "NEWS"]);
    expect(out.containedSources).toHaveLength(1);
    expect(out.monitoringImpaired).toBe(true);
  });

  it("a probed source WITHOUT an actuation policy never changes display", () => {
    const out = applyContainment(
      feed(),
      {
        state: state({
          "globe-events": rec({ state: "quarantined", reason: "empty" }),
          feed: rec({ state: "quarantined", reason: "empty" }),
        }),
        error: false,
      },
      NOW,
    );
    expect(out.cards).toHaveLength(3);
    expect(out.containedSources).toBeUndefined();
  });
});
