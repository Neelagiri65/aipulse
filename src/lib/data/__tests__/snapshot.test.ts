import { describe, expect, it } from "vitest";
import {
  snapshotKey,
  summariseEvents24h,
  summarisePackageLatest,
  summariseRegistry,
  summariseSources,
  ymdUtc,
} from "@/lib/data/snapshot";
import type { RegistryEntry } from "@/lib/data/registry-shared";
import type { PackageLatest } from "@/lib/data/pkg-store";

describe("ymdUtc", () => {
  it("returns YYYY-MM-DD in UTC regardless of local zone", () => {
    expect(ymdUtc(new Date("2026-04-21T00:00:00Z"))).toBe("2026-04-21");
    expect(ymdUtc(new Date("2026-04-21T23:59:59Z"))).toBe("2026-04-21");
    expect(ymdUtc(new Date("2026-04-22T00:00:00Z"))).toBe("2026-04-22");
  });
});

describe("snapshotKey", () => {
  it("prefixes the date with snapshot:", () => {
    expect(snapshotKey("2026-04-21")).toBe("snapshot:2026-04-21");
  });
});

describe("summariseSources", () => {
  it("returns non-negative counts where verified + pending equals total", () => {
    const s = summariseSources();
    expect(s.total).toBeGreaterThan(0);
    expect(s.verified).toBeGreaterThanOrEqual(0);
    expect(s.pending).toBeGreaterThanOrEqual(0);
    expect(s.verified + s.pending).toBe(s.total);
  });
});

function mkEntry(
  overrides: Partial<RegistryEntry> = {},
): RegistryEntry {
  return {
    fullName: "owner/name",
    owner: "owner",
    name: "name",
    firstSeen: "2026-04-01T00:00:00Z",
    lastActivity: "2026-04-20T00:00:00Z",
    configs: [],
    ...overrides,
  };
}

describe("summariseRegistry", () => {
  it("counts total, located entries, and per-config-kind tallies", () => {
    const entries: RegistryEntry[] = [
      mkEntry({
        configs: [
          {
            kind: "claude-md",
            path: "CLAUDE.md",
            sample: "...",
            score: 1,
            verifiedAt: "2026-04-20T00:00:00Z",
          },
        ],
        location: { lat: 0, lng: 0, label: "X" },
      }),
      mkEntry({
        configs: [
          {
            kind: "claude-md",
            path: "CLAUDE.md",
            sample: "...",
            score: 1,
            verifiedAt: "2026-04-20T00:00:00Z",
          },
          {
            kind: "cursorrules",
            path: ".cursorrules",
            sample: "...",
            score: 1,
            verifiedAt: "2026-04-20T00:00:00Z",
          },
        ],
        location: null,
      }),
      mkEntry({ configs: [] }),
    ];
    const s = summariseRegistry(entries);
    expect(s.total).toBe(3);
    expect(s.withLocation).toBe(1);
    expect(s.geocodeRate).toBeCloseTo(1 / 3);
    expect(s.byConfigKind["claude-md"]).toBe(2);
    expect(s.byConfigKind["cursorrules"]).toBe(1);
  });

  it("handles an empty registry without dividing by zero", () => {
    const s = summariseRegistry([]);
    expect(s.total).toBe(0);
    expect(s.withLocation).toBe(0);
    expect(s.geocodeRate).toBe(0);
    expect(s.byConfigKind).toEqual({});
  });
});

describe("summariseEvents24h", () => {
  it("tallies window size and aiConfig share from point meta", () => {
    const points = [
      { meta: { hasAiConfig: true } },
      { meta: { hasAiConfig: true } },
      { meta: { hasAiConfig: false } },
      { meta: {} },
    ];
    const s = summariseEvents24h(points);
    expect(s.windowSize).toBe(4);
    expect(s.withAiConfig).toBe(2);
    expect(s.aiConfigShare).toBe(0.5);
  });

  it("returns zeros for an empty window without dividing by zero", () => {
    const s = summariseEvents24h([]);
    expect(s).toEqual({ windowSize: 0, withAiConfig: 0, aiConfigShare: 0 });
  });

  it("treats missing meta as aiConfig:false (honest-by-default)", () => {
    const s = summariseEvents24h([{}, {}, {}]);
    expect(s.withAiConfig).toBe(0);
    expect(s.aiConfigShare).toBe(0);
  });
});

describe("summarisePackageLatest", () => {
  it("flattens the counters map into entries sorted by name", () => {
    const latest: PackageLatest = {
      source: "pypi",
      fetchedAt: "2026-04-21T12:15:00Z",
      counters: {
        openai: { lastDay: 2, lastWeek: 14, lastMonth: 60 },
        anthropic: { lastDay: 1, lastWeek: 7, lastMonth: 30 },
      },
      failures: [],
    };
    const entries = summarisePackageLatest(latest);
    expect(entries).toEqual([
      { name: "anthropic", lastDay: 1, lastWeek: 7, lastMonth: 30 },
      { name: "openai", lastDay: 2, lastWeek: 14, lastMonth: 60 },
    ]);
  });

  it("returns an empty list when no counters were fetched", () => {
    const latest: PackageLatest = {
      source: "pypi",
      fetchedAt: "2026-04-21T12:15:00Z",
      counters: {},
      failures: [{ pkg: "anthropic", message: "HTTP 500" }],
    };
    expect(summarisePackageLatest(latest)).toEqual([]);
  });
});
