import { describe, expect, it } from "vitest";
import { loadSdkAdoptionLosers30dBlock } from "@/lib/reports/blocks/sdk-adoption-losers-30d";
import { SDK_GROWTH_SANITY_LOW } from "@/lib/reports/blocks/sdk-adoption-gainers-30d";
import type {
  SdkAdoptionDto,
  SdkAdoptionPackage,
  SdkAdoptionRegistry,
} from "@/lib/data/sdk-adoption";

function mkDays(
  counts: Array<number | null>,
  startDate = "2026-04-04",
): SdkAdoptionPackage["days"] {
  const start = Date.UTC(
    Number(startDate.slice(0, 4)),
    Number(startDate.slice(5, 7)) - 1,
    Number(startDate.slice(8, 10)),
  );
  return counts.map((count, i) => {
    const d = new Date(start + i * 24 * 60 * 60 * 1000);
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return { date: `${yy}-${mm}-${dd}`, count, delta: null };
  });
}

function mkPackage(
  registry: SdkAdoptionRegistry,
  name: string,
  days: SdkAdoptionPackage["days"],
): SdkAdoptionPackage {
  const last = [...days].reverse().find((d) => d.count !== null);
  return {
    id: `${registry}:${name}`,
    label: name,
    registry,
    latest: { count: last?.count ?? null, fetchedAt: null },
    days,
    firstParty: false,
    caveat: null,
    counterName: "lastDay",
    counterUnits: "downloads/day",
  };
}

const FIXED_NOW = () => new Date("2026-05-04T00:00:00.000Z");

function mkDto(packages: SdkAdoptionPackage[]): SdkAdoptionDto {
  return { packages, generatedAt: "2026-05-04T00:00:00.000Z" };
}

describe("loadSdkAdoptionLosers30dBlock — happy path", () => {
  it("ranks packages by % decline (steepest first), excluding flat/positive growth", () => {
    const dto = mkDto([
      mkPackage("npm", "stable", mkDays([100, ...Array(29).fill(100), 100])), // 0% — excluded
      mkPackage("npm", "growing", mkDays([100, ...Array(29).fill(150), 200])), // +100% — excluded
      mkPackage("npm", "mild-decline", mkDays([100, ...Array(29).fill(95), 90])), // -10%
      mkPackage("npm", "steep-decline", mkDays([1000, ...Array(29).fill(800), 600])), // -40%
      mkPackage("pypi", "moderate-decline", mkDays([100, ...Array(29).fill(80), 75])), // -25%
    ]);
    const result = loadSdkAdoptionLosers30dBlock({ dto, now: FIXED_NOW });
    expect(result.rows.map((r) => r.label)).toEqual([
      "steep-decline",
      "moderate-decline",
      "mild-decline",
    ]);
  });

  it("renders the delta with a leading minus sign", () => {
    const dto = mkDto([
      mkPackage("pypi", "x", mkDays([1000, ...Array(29).fill(800), 600])),
    ]);
    const result = loadSdkAdoptionLosers30dBlock({ dto, now: FIXED_NOW });
    expect(result.rows[0].delta).toMatch(/^-\d+\.\d% over \d+d$/);
  });
});

describe("loadSdkAdoptionLosers30dBlock — sanity gate (S62f: exclude from display)", () => {
  it("EXCLUDES rows below the sanity floor from display, warns ops", () => {
    const dto = mkDto([
      mkPackage("npm", "abandoned", mkDays([10_000, ...Array(29).fill(500), 50])), // -99.5%
    ]);
    const result = loadSdkAdoptionLosers30dBlock({ dto, now: FIXED_NOW });
    expect(result.sanityWarnings.length).toBeGreaterThanOrEqual(1);
    expect(result.sanityWarnings[0]).toContain("abandoned");
    expect(result.sanityWarnings[0]).toContain("excluded from display");
    // Row NOT shipped to public display.
    expect(result.rows.map((r) => r.label)).not.toContain("abandoned");
  });

  it("backfills with next-best candidate when a sanity-violating row is excluded", () => {
    const dto = mkDto([
      mkPackage("npm", "abandoned", mkDays([10_000, ...Array(29).fill(500), 50])), // -99.5%, excluded
      mkPackage("npm", "real-decline", mkDays([1000, ...Array(29).fill(800), 600])), // -40%, kept
    ]);
    const result = loadSdkAdoptionLosers30dBlock({ dto, now: FIXED_NOW });
    expect(result.rows.map((r) => r.label)).toEqual(["real-decline"]);
  });

  it("does NOT flag declines within the sanity band", () => {
    const dto = mkDto([
      mkPackage("npm", "x", mkDays([1000, ...Array(29).fill(800), 600])), // -40%
    ]);
    const result = loadSdkAdoptionLosers30dBlock({ dto, now: FIXED_NOW });
    expect(result.sanityWarnings).toEqual([]);
  });

  it("uses the same SANITY_LOW constant as the gainers block (single source of truth)", () => {
    expect(SDK_GROWTH_SANITY_LOW).toBe(-90);
  });
});

describe("loadSdkAdoptionLosers30dBlock — edge cases", () => {
  it("returns rows: [] when no package has a non-zero decline", () => {
    const dto = mkDto([
      mkPackage("npm", "flat", mkDays([100, ...Array(29).fill(100), 100])),
      mkPackage("npm", "growing", mkDays([100, ...Array(29).fill(150), 200])),
    ]);
    const result = loadSdkAdoptionLosers30dBlock({ dto, now: FIXED_NOW });
    expect(result.rows).toEqual([]);
  });

  it("returns rows: [] for empty input", () => {
    const result = loadSdkAdoptionLosers30dBlock({
      dto: mkDto([]),
      now: FIXED_NOW,
    });
    expect(result.rows).toEqual([]);
  });
});
