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
      "benchmarks",
      "tool-health",
      "hn",
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

describe("composeDigest — inferences (S60 Build 1)", () => {
  it("emits inferences only in diff mode", () => {
    // Bootstrap: no yesterday → mode bootstrap → no inferences even
    // when history is supplied.
    const history = Array.from({ length: 7 }, (_, i) =>
      mkSnapshot({ date: `2026-04-${String(22 - i).padStart(2, "0")}` }),
    );
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: null,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
      history,
    });
    expect(body.mode).toBe("bootstrap");
    expect(body.inferences).toBeUndefined();
  });

  it("populates inferences when diff mode + ≥3 days of history fire a rule", () => {
    // Set up a benchmark-leader change today vs yesterday so diff mode
    // is selected AND deriveInferences fires the leader-change rule.
    const today = mkSnapshot({
      benchmarks: {
        publishDate: "2026-04-22",
        top3: [
          { rank: 1, modelName: "GPT-7", organization: "OpenAI", rating: 1510 },
          { rank: 2, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
          { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
        ],
      },
    });
    const yesterday = mkSnapshot({ date: "2026-04-21" });
    const history = [today, yesterday, mkSnapshot({ date: "2026-04-20" })];
    const body = composeDigest({
      today,
      yesterday,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
      history,
    });
    expect(body.mode).toBe("diff");
    expect(body.inferences).toBeDefined();
    expect(body.inferences?.[0]).toMatch(/New #1 on LMArena/);
  });

  it("leaves inferences undefined when no rule fires (avoids empty array in archive blob)", () => {
    // Diff mode (incident triggers it) but identical snapshots → no
    // streaks, no leader change.
    const incident = {
      id: "i1",
      name: "x",
      status: "resolved" as const,
      impact: "minor" as const,
      createdAt: "2026-04-22T01:00:00Z",
      resolvedAt: "2026-04-22T02:00:00Z",
    };
    const today = mkSnapshot();
    const history = [today, mkSnapshot({ date: "2026-04-21" }), mkSnapshot({ date: "2026-04-20" })];
    const body = composeDigest({
      today,
      yesterday: mkSnapshot({ date: "2026-04-21" }),
      hn: mkHn(),
      incidents24h: [incident],
      now: NOW,
      history,
    });
    expect(body.mode).toBe("diff");
    expect(body.inferences).toBeUndefined();
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

  it('drops "and beyond" from greeting templates — geo phrasing only mentions the country', () => {
    const bootstrap = composeDigest({
      today: mkSnapshot(),
      yesterday: null,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    const quiet = composeDigest({
      today: mkSnapshot(),
      yesterday: mkSnapshot(),
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(bootstrap.greetingTemplate).not.toContain("and beyond");
    expect(quiet.greetingTemplate).not.toContain("and beyond");
  });
});

describe("composeDigest — TL;DR", () => {
  it("emits a TL;DR for diff mode summarising what moved", () => {
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
    const incident: HistoricalIncident = {
      id: "i1",
      name: "OpenAI latency spike",
      status: "resolved",
      impact: "minor",
      createdAt: "2026-04-22T01:00:00Z",
      resolvedAt: "2026-04-22T02:00:00Z",
    };
    const body = composeDigest({
      today,
      yesterday,
      hn: mkHn(),
      incidents24h: [incident],
      now: NOW,
    });
    expect(body.mode).toBe("diff");
    expect(body.tldr).toBeTruthy();
    expect(body.tldr!).toContain("1 tool incident");
    expect(body.tldr!).toContain("benchmark mover");
  });

  it("does not emit a TL;DR in bootstrap or quiet modes", () => {
    const bootstrap = composeDigest({
      today: mkSnapshot(),
      yesterday: null,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    const quiet = composeDigest({
      today: mkSnapshot(),
      yesterday: mkSnapshot(),
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(bootstrap.tldr).toBeUndefined();
    expect(quiet.tldr).toBeUndefined();
  });

  it("threads priorIncidentCount into the tool-health headline as a baseline", () => {
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
      priorIncidentCount: 3,
      now: NOW,
    });
    const toolHealth = body.sections.find((s) => s.id === "tool-health")!;
    expect(toolHealth.headline).toContain("vs 3 yesterday");
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
