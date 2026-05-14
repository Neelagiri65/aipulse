import { describe, expect, it } from "vitest";
import { assembleSdkAdoption } from "@/lib/data/sdk-adoption";
import type { DailySnapshot, SnapshotPackages } from "@/lib/data/snapshot";
import type { PackageLatest } from "@/lib/data/pkg-store";

/**
 * Tests for the panel DTO assembler. The assembler stitches together
 * `pkg:{source}:latest` blobs (current count) with the last 30
 * `snapshot:{YYYY-MM-DD}.packages` blobs (history) into a row-per-package
 * DTO with columns = the last 30 UTC days.
 *
 * Every test is hermetic: pass synthetic snapshots + latest, assert DTO
 * shape. No Redis, no time-travel.
 */

function makeSnapshot(
  date: string,
  packages: SnapshotPackages,
): DailySnapshot {
  return {
    date,
    capturedAt: `${date}T04:00:00Z`,
    sources: { total: 0, verified: 0, pending: 0 },
    registry: null,
    events24h: null,
    tools: [],
    benchmarks: null,
    packages,
    labs24h: null,
    failures: [],
  };
}

function makeLatest(
  source: string,
  counters: PackageLatest["counters"],
): PackageLatest {
  return {
    source,
    fetchedAt: "2026-04-25T04:00:00Z",
    counters,
    failures: [],
  };
}

describe("assembleSdkAdoption", () => {
  it("returns empty packages array when no latest + no snapshots", () => {
    const dto = assembleSdkAdoption({
      pkgLatest: { pypi: null, npm: null, crates: null, docker: null, brew: null, vscode: null },
      snapshots: [],
      today: "2026-04-25",
    });
    expect(dto.packages).toEqual([]);
    expect(dto.generatedAt).toBeTruthy();
  });

  it("emits one row per (registry, package) and uses {registry}:{name} as id", () => {
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: makeLatest("pypi", { transformers: { lastDay: 1000 } }),
        npm: makeLatest("npm", { openai: { lastDay: 500 } }),
        crates: null,
        docker: null,
        brew: null,
        vscode: null,
      },
      snapshots: [],
      today: "2026-04-25",
    });
    const ids = dto.packages.map((p) => p.id).sort();
    expect(ids).toEqual(["npm:openai", "pypi:transformers"]);
  });

  it("disambiguates same-name packages across registries", () => {
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: makeLatest("pypi", { openai: { lastDay: 1000 } }),
        npm: makeLatest("npm", { openai: { lastDay: 500 } }),
        crates: null,
        docker: null,
        brew: null,
        vscode: null,
      },
      snapshots: [],
      today: "2026-04-25",
    });
    const ids = dto.packages.map((p) => p.id);
    expect(ids).toContain("pypi:openai");
    expect(ids).toContain("npm:openai");
    expect(new Set(ids).size).toBe(2);
  });

  it("uses lastDay as the daily counter for pypi", () => {
    const snap1 = makeSnapshot("2026-04-23", {
      pypi: [{ name: "transformers", lastDay: 100 }],
    });
    const snap2 = makeSnapshot("2026-04-24", {
      pypi: [{ name: "transformers", lastDay: 110 }],
    });
    const snap3 = makeSnapshot("2026-04-25", {
      pypi: [{ name: "transformers", lastDay: 130 }],
    });
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: makeLatest("pypi", { transformers: { lastDay: 130 } }),
        npm: null,
        crates: null,
        docker: null,
        brew: null,
        vscode: null,
      },
      snapshots: [snap1, snap2, snap3],
      today: "2026-04-25",
      windowDays: 3,
    });
    const row = dto.packages.find((p) => p.id === "pypi:transformers")!;
    expect(row.counterName).toBe("lastDay");
    expect(row.days.map((d) => d.count)).toEqual([100, 110, 130]);
  });

  it("uses lastDay as the daily counter for npm", () => {
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: null,
        npm: makeLatest("npm", { openai: { lastDay: 50 } }),
        crates: null,
        docker: null,
        brew: null,
        vscode: null,
      },
      snapshots: [
        makeSnapshot("2026-04-25", {
          npm: [{ name: "openai", lastDay: 50 }],
        }),
      ],
      today: "2026-04-25",
      windowDays: 1,
    });
    const row = dto.packages[0];
    expect(row.counterName).toBe("lastDay");
    expect(row.days[0].count).toBe(50);
  });

  it("derives crates daily count as allTime[d] - allTime[d-1]", () => {
    const snaps = [
      makeSnapshot("2026-04-23", {
        crates: [{ name: "candle-core", allTime: 1000 }],
      }),
      makeSnapshot("2026-04-24", {
        crates: [{ name: "candle-core", allTime: 1100 }],
      }),
      makeSnapshot("2026-04-25", {
        crates: [{ name: "candle-core", allTime: 1250 }],
      }),
    ];
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: null,
        npm: null,
        crates: makeLatest("crates", { "candle-core": { allTime: 1250 } }),
        docker: null,
        brew: null,
        vscode: null,
      },
      snapshots: snaps,
      today: "2026-04-25",
      windowDays: 3,
    });
    const row = dto.packages[0];
    expect(row.counterName).toBe("allTime diff");
    // First day has no prior snapshot in the window → null count.
    expect(row.days[0].count).toBeNull();
    expect(row.days[1].count).toBe(100); // 1100 - 1000
    expect(row.days[2].count).toBe(150); // 1250 - 1100
  });

  it("derives docker daily count as allTime diff", () => {
    const snaps = [
      makeSnapshot("2026-04-24", {
        docker: [{ name: "ollama/ollama", allTime: 5000 }],
      }),
      makeSnapshot("2026-04-25", {
        docker: [{ name: "ollama/ollama", allTime: 5300 }],
      }),
    ];
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: null,
        npm: null,
        crates: null,
        docker: makeLatest("docker", { "ollama/ollama": { allTime: 5300 } }),
        brew: null,
        vscode: null,
      },
      snapshots: snaps,
      today: "2026-04-25",
      windowDays: 2,
    });
    const row = dto.packages[0];
    expect(row.days[1].count).toBe(300);
  });

  it("derives brew daily count as lastMonth diff", () => {
    const snaps = [
      makeSnapshot("2026-04-24", {
        brew: [{ name: "ollama", lastMonth: 50000 }],
      }),
      makeSnapshot("2026-04-25", {
        brew: [{ name: "ollama", lastMonth: 50800 }],
      }),
    ];
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: null,
        npm: null,
        crates: null,
        docker: null,
        brew: makeLatest("brew", { ollama: { lastMonth: 50800 } }),
        vscode: null,
      },
      snapshots: snaps,
      today: "2026-04-25",
      windowDays: 2,
    });
    const row = dto.packages[0];
    expect(row.counterName).toBe("lastMonth diff");
    expect(row.days[1].count).toBe(800);
  });

  it("renders a column-per-day for the requested windowDays even when snapshots are sparse", () => {
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: makeLatest("pypi", { transformers: { lastDay: 100 } }),
        npm: null,
        crates: null,
        docker: null,
        brew: null,
        vscode: null,
      },
      snapshots: [
        makeSnapshot("2026-04-25", {
          pypi: [{ name: "transformers", lastDay: 100 }],
        }),
      ],
      today: "2026-04-25",
      windowDays: 5,
    });
    const row = dto.packages[0];
    expect(row.days).toHaveLength(5);
    expect(row.days.map((d) => d.date)).toEqual([
      "2026-04-21",
      "2026-04-22",
      "2026-04-23",
      "2026-04-24",
      "2026-04-25",
    ]);
    // Only the last day has a snapshot → only the last cell has a count.
    expect(row.days.slice(0, 4).every((d) => d.count === null)).toBe(true);
    expect(row.days[4].count).toBe(100);
  });

  it("flags pypi rows with the third-party-aggregator caveat and firstParty=false", () => {
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: makeLatest("pypi", { transformers: { lastDay: 100 } }),
        npm: null,
        crates: null,
        docker: null,
        brew: null,
        vscode: null,
      },
      snapshots: [],
      today: "2026-04-25",
    });
    const row = dto.packages[0];
    expect(row.firstParty).toBe(false);
    expect(row.caveat).toMatch(/pypistats/i);
  });

  it("flags first-party registries (npm/crates/docker/brew) with firstParty=true and no aggregator caveat", () => {
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: null,
        npm: makeLatest("npm", { openai: { lastDay: 1 } }),
        crates: makeLatest("crates", { burn: { allTime: 1 } }),
        docker: makeLatest("docker", { "vllm/vllm-openai": { allTime: 1 } }),
        brew: makeLatest("brew", { ollama: { lastMonth: 1 } }),
        vscode: null,
      },
      snapshots: [],
      today: "2026-04-25",
    });
    for (const row of dto.packages) {
      if (row.registry === "pypi") continue;
      expect(row.firstParty).toBe(true);
    }
  });

  it("includes packages observed in snapshots but missing from latest (with null latest count)", () => {
    const snaps = [
      makeSnapshot("2026-04-25", {
        pypi: [{ name: "anthropic", lastDay: 200 }],
      }),
    ];
    const dto = assembleSdkAdoption({
      pkgLatest: {
        pypi: null,
        npm: null,
        crates: null,
        docker: null,
        brew: null,
        vscode: null,
      },
      snapshots: snaps,
      today: "2026-04-25",
      windowDays: 1,
    });
    const row = dto.packages.find((p) => p.id === "pypi:anthropic")!;
    expect(row).toBeTruthy();
    expect(row.latest.count).toBeNull();
    expect(row.latest.fetchedAt).toBeNull();
  });
});
