import { describe, expect, it } from "vitest";
import { getReportConfig, listReportSlugs } from "@/lib/reports/registry";

describe("getReportConfig", () => {
  it("returns the 2026-04-tooling config by its registered slug", () => {
    const config = getReportConfig("2026-04-tooling");
    expect(config).not.toBeNull();
    expect(config?.slug).toBe("2026-04-tooling");
    expect(config?.window).toBe("April 2026");
    expect(config?.sections.length).toBeGreaterThanOrEqual(5);
    expect(config?.sections.length).toBeLessThanOrEqual(7);
  });

  it("returns null for unknown slugs", () => {
    expect(getReportConfig("not-a-real-report")).toBeNull();
    expect(getReportConfig("")).toBeNull();
  });
});

describe("listReportSlugs", () => {
  it("includes the 2026-04-tooling slug", () => {
    expect(listReportSlugs()).toContain("2026-04-tooling");
  });

  it("returns deterministic (sorted) output", () => {
    const a = listReportSlugs();
    const b = listReportSlugs();
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(a);
  });
});

describe("2026-04-tooling config — engineering-scaffold contract", () => {
  it("references only block ids that exist in the GenesisBlockId union", () => {
    const config = getReportConfig("2026-04-tooling");
    expect(config).not.toBeNull();
    // Whitelist matches the GenesisBlockId union in types.ts.
    const validBlockIds = new Set([
      "sdk-adoption-gainers-30d",
      "sdk-adoption-losers-30d",
      "openrouter-rank-climbers-30d",
      "openrouter-rank-fallers-30d",
      "labs-activity-leaders-30d",
      "tool-incidents-30d",
      "agents-velocity-30d",
    ]);
    for (const s of config!.sections) {
      expect(validBlockIds.has(s.blockId)).toBe(true);
    }
  });

  it("has every section's blockId unique (no duplicate sections by data)", () => {
    const config = getReportConfig("2026-04-tooling");
    const ids = config!.sections.map((s) => s.blockId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
