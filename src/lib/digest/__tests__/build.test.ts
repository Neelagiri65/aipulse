import { describe, expect, it, vi } from "vitest";
import { buildDigestForDate, previousUtcDate } from "@/lib/digest/build";
import type { DailySnapshot } from "@/lib/data/snapshot";
import type { HnWireResult } from "@/lib/data/wire-hn";

function mkSnapshot(date: string, overrides: Partial<DailySnapshot> = {}): DailySnapshot {
  return {
    date,
    capturedAt: `${date}T08:00:00Z`,
    sources: { total: 20, verified: 15, pending: 5 },
    registry: null,
    events24h: null,
    tools: [
      { id: "openai", status: "operational", activeIncidents: 0 },
      { id: "anthropic", status: "operational", activeIncidents: 0 },
    ],
    benchmarks: {
      publishDate: date,
      top3: [
        { rank: 1, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
        { rank: 2, modelName: "GPT-6", organization: "OpenAI", rating: 1490 },
        { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
      ],
    },
    packages: null,
    labs24h: [],
    failures: [],
    ...overrides,
  };
}

function mkHn(): HnWireResult {
  return {
    ok: true,
    items: [],
    points: [],
    polledAt: "2026-04-22T08:00:00Z",
    coverage: { itemsTotal: 0, itemsWithLocation: 0, geocodeResolutionPct: 0 },
    meta: { lastFetchOkTs: null, staleMinutes: null },
    source: "redis",
  };
}

describe("previousUtcDate", () => {
  it("rolls back one day", () => {
    expect(previousUtcDate("2026-04-22")).toBe("2026-04-21");
  });

  it("rolls across month boundary", () => {
    expect(previousUtcDate("2026-04-01")).toBe("2026-03-31");
  });

  it("rolls across year boundary", () => {
    expect(previousUtcDate("2026-01-01")).toBe("2025-12-31");
  });
});

describe("buildDigestForDate — happy path", () => {
  it("composes a DigestBody when today's snapshot exists", async () => {
    const today = mkSnapshot("2026-04-22");
    const yesterday = mkSnapshot("2026-04-21");
    const loadSnapshot = vi
      .fn()
      .mockImplementation(async (d: string) =>
        d === "2026-04-22" ? today : d === "2026-04-21" ? yesterday : null,
      );
    const result = await buildDigestForDate({
      date: "2026-04-22",
      previousDate: "2026-04-21",
      now: new Date("2026-04-22T08:00:00Z"),
      loadSnapshot,
      loadHn: async () => mkHn(),
      loadIncidents24h: async () => [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.date).toBe("2026-04-22");
      expect(result.body.sections.length).toBeGreaterThan(0);
    }
    expect(loadSnapshot).toHaveBeenCalledWith("2026-04-22");
    expect(loadSnapshot).toHaveBeenCalledWith("2026-04-21");
  });

  it("emits 'bootstrap' mode when yesterday's snapshot is missing", async () => {
    const today = mkSnapshot("2026-04-22");
    const result = await buildDigestForDate({
      date: "2026-04-22",
      previousDate: "2026-04-21",
      now: new Date("2026-04-22T08:00:00Z"),
      loadSnapshot: async (d: string) => (d === "2026-04-22" ? today : null),
      loadHn: async () => mkHn(),
      loadIncidents24h: async () => [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.mode).toBe("bootstrap");
  });
});

describe("buildDigestForDate — failure modes", () => {
  it("returns no-snapshot when today's snapshot is missing", async () => {
    const result = await buildDigestForDate({
      date: "2026-04-22",
      previousDate: "2026-04-21",
      now: new Date("2026-04-22T08:00:00Z"),
      loadSnapshot: async () => null,
      loadHn: async () => mkHn(),
      loadIncidents24h: async () => [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-snapshot");
  });
});
