import { describe, expect, it } from "vitest";
import { composeDigest } from "@/lib/digest/compose";
import type { DailySnapshot } from "@/lib/data/snapshot";
import type { HnWireResult } from "@/lib/data/wire-hn";
import type { HistoricalIncident } from "@/lib/data/status-history";

const NOW = new Date("2026-04-22T08:00:00Z");

function mkSnapshot(overrides: Partial<DailySnapshot> = {}): DailySnapshot {
  return {
    date: "2026-04-22",
    capturedAt: "2026-04-22T08:00:00Z",
    sources: { total: 20, verified: 15, pending: 5 },
    registry: null,
    events24h: null,
    tools: [
      { id: "openai", status: "operational", activeIncidents: 0 },
      { id: "anthropic", status: "operational", activeIncidents: 0 },
    ],
    benchmarks: {
      publishDate: "2026-04-21",
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

describe("composeDigest — body mode", () => {
  it("returns bootstrap when yesterday is null", () => {
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: null,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.mode).toBe("bootstrap");
    expect(body.subject).toContain("where things stand");
  });

  it("returns quiet when yesterday exists and no section moved", () => {
    const today = mkSnapshot();
    const yesterday = mkSnapshot();
    const body = composeDigest({
      today,
      yesterday,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.mode).toBe("quiet");
    expect(body.subject).toContain("all quiet");
  });

  it("returns diff when any diff-bearing section has movement", () => {
    const today = mkSnapshot();
    const yesterday = mkSnapshot({
      benchmarks: {
        publishDate: "2026-04-20",
        top3: [
          { rank: 1, modelName: "GPT-6", organization: "OpenAI", rating: 1490 },
          { rank: 2, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
          { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
        ],
      },
    });
    const body = composeDigest({
      today,
      yesterday,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.mode).toBe("diff");
  });

  it("flips to diff when incidents are present even with no status transitions", () => {
    const incident: HistoricalIncident = {
      id: "i1",
      name: "OpenAI latency spike",
      status: "resolved",
      impact: "minor",
      createdAt: "2026-04-22T01:00:00Z",
      resolvedAt: "2026-04-22T02:00:00Z",
    };
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: mkSnapshot(),
      hn: mkHn(),
      incidents24h: [incident],
      now: NOW,
    });
    expect(body.mode).toBe("diff");
    expect(body.subject).toContain("1 tool incident");
  });
});

describe("composeDigest — sections", () => {
  it("always emits 5 sections in fixed order", () => {
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: null,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.sections.map((s) => s.id)).toEqual([
      "tool-health",
      "hn",
      "benchmarks",
      "sdk-adoption",
      "labs",
    ]);
  });

  it("each section carries a headline and a sourceUrls array", () => {
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: null,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    for (const s of body.sections) {
      expect(s.headline).toBeTruthy();
      expect(Array.isArray(s.sourceUrls)).toBe(true);
    }
  });
});

describe("composeDigest — greeting template", () => {
  it("uses the bootstrap greeting when mode is bootstrap", () => {
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: null,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.greetingTemplate).toContain("{geoCountry}");
    expect(body.greetingTemplate).toMatch(/Welcome/);
  });

  it("uses the quiet greeting when mode is quiet", () => {
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: mkSnapshot(),
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.greetingTemplate).toMatch(/all quiet/);
  });
});

describe("composeDigest — determinism", () => {
  it("returns generatedAt matching input now", () => {
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: null,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.generatedAt).toBe(NOW.toISOString());
  });

  it("date is the today snapshot's date (not generatedAt)", () => {
    const body = composeDigest({
      today: mkSnapshot({ date: "2026-04-22" }),
      yesterday: null,
      hn: mkHn(),
      incidents24h: [],
      now: new Date("2026-04-23T08:00:00Z"),
    });
    expect(body.date).toBe("2026-04-22");
  });
});
