import { describe, expect, it } from "vitest";
import {
  computeWindowGrowth,
  loadSdkAdoptionGainers30dBlock,
  SDK_GROWTH_SANITY_HIGH,
  SDK_GROWTH_SANITY_LOW,
} from "@/lib/reports/blocks/sdk-adoption-gainers-30d";
import type {
  SdkAdoptionDto,
  SdkAdoptionPackage,
  SdkAdoptionRegistry,
} from "@/lib/data/sdk-adoption";

function mkDays(
  counts: Array<number | null>,
  startDate = "2026-04-04",
): SdkAdoptionPackage["days"] {
  // counts is oldest-first. Build matching `{date, count, delta}` entries
  // — delta isn't used by the gainers block but the type requires it.
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
  overrides: Partial<SdkAdoptionPackage> = {},
): SdkAdoptionPackage {
  const lastNonNull = [...days].reverse().find((d) => d.count !== null);
  return {
    id: `${registry}:${name}`,
    label: name,
    registry,
    latest: { count: lastNonNull?.count ?? null, fetchedAt: null },
    days,
    firstParty: false,
    caveat: null,
    counterName: "lastDay",
    counterUnits: "downloads/day",
    ...overrides,
  };
}

function mkDto(packages: SdkAdoptionPackage[]): SdkAdoptionDto {
  return { packages, generatedAt: "2026-05-04T00:00:00.000Z" };
}

const FIXED_NOW = () => new Date("2026-05-04T00:00:00.000Z");

describe("computeWindowGrowth — sparse-tolerant", () => {
  it("returns null for a fully-empty days array", () => {
    expect(computeWindowGrowth(mkPackage("npm", "x", []), 30)).toBeNull();
  });

  it("returns null when only one non-null entry exists (no baseline)", () => {
    const days = mkDays(Array(30).fill(null));
    days[28].count = 100;
    expect(computeWindowGrowth(mkPackage("npm", "x", days), 30)).toBeNull();
  });

  it("returns null when the chosen baseline count is 0 (divide-by-zero)", () => {
    const days = mkDays(Array(30).fill(null));
    days[5].count = 0;
    days[28].count = 100;
    expect(computeWindowGrowth(mkPackage("npm", "x", days), 30)).toBeNull();
  });

  it("computes % growth correctly for a simple 2x case (newest + oldest both at the ends)", () => {
    const days = mkDays([100, ...Array(29).fill(null)]);
    days[29].count = 200;
    const got = computeWindowGrowth(mkPackage("npm", "x", days), 30);
    expect(got!.pctGrowth).toBeCloseTo(100, 5);
    expect(got!.latestCount).toBe(200);
    expect(got!.baseCount).toBe(100);
    expect(got!.effectiveDays).toBe(29);
  });

  it("returns negative growth for declines", () => {
    const days = mkDays(Array(30).fill(null));
    days[0].count = 1000;
    days[29].count = 750;
    const got = computeWindowGrowth(mkPackage("npm", "x", days), 30);
    expect(got!.pctGrowth).toBeCloseTo(-25, 5);
  });

  it("tolerates a null tail — uses newest non-null instead (real prod shape)", () => {
    // Real shape from prod: index 17..28 have data, 29 is null, 0..16 are null.
    const days = mkDays(Array(30).fill(null));
    days[17].count = 100;
    days[28].count = 200;
    const got = computeWindowGrowth(mkPackage("npm", "x", days), 30);
    expect(got).not.toBeNull();
    expect(got!.latestCount).toBe(200);
    expect(got!.baseCount).toBe(100);
    expect(got!.effectiveDays).toBe(28 - 17);
    expect(got!.pctGrowth).toBeCloseTo(100, 5);
  });

  it("tolerates a null head — uses oldest non-null within window from newest", () => {
    const days = mkDays(Array(30).fill(null));
    days[20].count = 50; // baseline
    days[29].count = 100; // latest
    const got = computeWindowGrowth(mkPackage("npm", "x", days), 30);
    expect(got!.effectiveDays).toBe(9);
    expect(got!.pctGrowth).toBeCloseTo(100, 5);
  });

  it("does NOT reach for ancient data outside the windowDays from newest", () => {
    // Newest non-null at index 28; baseline anchor = 28 - 7 = 21.
    // The non-null at index 5 is OUTSIDE the window — must NOT be used.
    const days = mkDays(Array(30).fill(null));
    days[5].count = 999_999; // ancient — must be ignored
    days[28].count = 100;
    const got = computeWindowGrowth(mkPackage("npm", "x", days), 7);
    // No non-null entry within indices 21..27 → no baseline → null.
    expect(got).toBeNull();
  });
});

describe("loadSdkAdoptionGainers30dBlock — happy path", () => {
  it("ranks packages by % growth descending and keeps top N (default 3)", () => {
    const dto = mkDto([
      mkPackage(
        "pypi",
        "torch",
        mkDays([1000, ...Array(29).fill(900), 850]),
      ), // -15% — out of top 3
      mkPackage(
        "npm",
        "anthropic",
        mkDays([100, ...Array(29).fill(150), 250]),
      ), // +150%
      mkPackage(
        "crates",
        "tokenizers",
        mkDays([100, ...Array(29).fill(120), 110]),
      ), // +10%
      mkPackage(
        "pypi",
        "openai",
        mkDays([100, ...Array(29).fill(150), 130]),
      ), // +30%
      mkPackage(
        "npm",
        "@huggingface/inference",
        mkDays([100, ...Array(29).fill(110), 105]),
      ), // +5% — last in
    ]);
    const result = loadSdkAdoptionGainers30dBlock({ dto, now: FIXED_NOW });
    expect(result.rows.map((r) => r.label)).toEqual([
      "anthropic",
      "openai",
      "tokenizers",
    ]);
  });

  it("populates per-row sourceUrl + sourceLabel from the registry mapping", () => {
    const dto = mkDto([
      mkPackage(
        "pypi",
        "torch",
        mkDays([100, ...Array(29).fill(150), 200]),
      ),
    ]);
    const result = loadSdkAdoptionGainers30dBlock({ dto, now: FIXED_NOW });
    expect(result.rows[0].sourceUrl).toBe("https://pypistats.org");
    expect(result.rows[0].sourceLabel).toBe("pypistats.org");
  });

  it("preserves the per-package caveat verbatim on the row", () => {
    const dto = mkDto([
      mkPackage(
        "pypi",
        "torch",
        mkDays([100, ...Array(29).fill(150), 200]),
        { caveat: "Counts via pypistats — third-party aggregator." },
      ),
    ]);
    const result = loadSdkAdoptionGainers30dBlock({ dto, now: FIXED_NOW });
    expect(result.rows[0].caveat).toBe(
      "Counts via pypistats — third-party aggregator.",
    );
  });

  it("formats counts compactly (k / M / B) and delta with a sign", () => {
    const dto = mkDto([
      mkPackage(
        "npm",
        "anthropic",
        mkDays([1_000_000, ...Array(29).fill(1_500_000), 2_500_000]),
      ),
    ]);
    const result = loadSdkAdoptionGainers30dBlock({ dto, now: FIXED_NOW });
    expect(result.rows[0].value).toContain("2.5M");
    expect(result.rows[0].delta).toMatch(/^\+\d+\.\d% over \d+d$/);
  });
});

describe("loadSdkAdoptionGainers30dBlock — sanity gates", () => {
  it("flags growth above the high sanity ceiling (likely denominator-near-zero artifact)", () => {
    const dto = mkDto([
      mkPackage(
        "npm",
        "surge",
        mkDays([1, ...Array(29).fill(50), 20_000]), // ~2,000,000% growth
      ),
    ]);
    const result = loadSdkAdoptionGainers30dBlock({ dto, now: FIXED_NOW });
    expect(result.sanityWarnings.length).toBeGreaterThanOrEqual(1);
    expect(result.sanityWarnings[0]).toContain("surge");
    expect(result.sanityWarnings[0]).toContain("sanity ceiling");
    // Row is still INCLUDED — sanity warnings are surfaced, not auto-suppressed.
    expect(result.rows.map((r) => r.label)).toContain("surge");
  });

  it("does NOT flag growth within the sanity band", () => {
    const dto = mkDto([
      mkPackage(
        "npm",
        "anthropic",
        mkDays([100, ...Array(29).fill(150), 200]), // +100%
      ),
    ]);
    const result = loadSdkAdoptionGainers30dBlock({ dto, now: FIXED_NOW });
    expect(result.sanityWarnings).toEqual([]);
  });

  it("exposes the sanity bounds as named exports for the launch-readiness gate", () => {
    expect(SDK_GROWTH_SANITY_HIGH).toBe(1000);
    expect(SDK_GROWTH_SANITY_LOW).toBe(-90);
  });
});

describe("loadSdkAdoptionGainers30dBlock — edge cases", () => {
  it("returns rows: [] when no package has at least 2 non-null entries (honest empty)", () => {
    // The new sparse-tolerant rule: a package qualifies as long as it
    // has a newest non-null AND an oldest non-null within window. A
    // single-non-null package can't be ranked.
    const single = mkDays(Array(30).fill(null));
    single[10].count = 100;
    const dto = mkDto([mkPackage("npm", "new-pkg", single)]);
    const result = loadSdkAdoptionGainers30dBlock({ dto, now: FIXED_NOW });
    expect(result.rows).toEqual([]);
    expect(result.sanityWarnings).toEqual([]);
    expect(result.generatedAt).toBe("2026-05-04T00:00:00.000Z");
  });

  it("returns rows: [] when input dto.packages is empty", () => {
    const result = loadSdkAdoptionGainers30dBlock({
      dto: mkDto([]),
      now: FIXED_NOW,
    });
    expect(result.rows).toEqual([]);
  });

  it("respects the topN argument", () => {
    const dto = mkDto([
      mkPackage("pypi", "a", mkDays([100, ...Array(29).fill(110), 150])),
      mkPackage("pypi", "b", mkDays([100, ...Array(29).fill(110), 140])),
      mkPackage("pypi", "c", mkDays([100, ...Array(29).fill(110), 130])),
      mkPackage("pypi", "d", mkDays([100, ...Array(29).fill(110), 120])),
    ]);
    const result = loadSdkAdoptionGainers30dBlock({
      dto,
      topN: 2,
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label)).toEqual(["a", "b"]);
  });
});
