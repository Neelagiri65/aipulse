import { describe, expect, it } from "vitest";
import {
  assembleModelUsage,
  computeTopKTurnover,
  parsePricing,
  type RawFrontendModel,
  type RawFrontendResponse,
  type RawCatalogueResponse,
} from "@/lib/data/openrouter-rankings";
import {
  MAJOR_LAB_AUTHORS,
  OPENROUTER_SOURCE_CAVEAT,
} from "@/lib/data/openrouter-types";

const FIXED_NOW = new Date("2026-04-26T12:00:00Z");
const fixedClock = () => FIXED_NOW;

function mkRaw(
  slug: string,
  overrides: Partial<RawFrontendModel> = {},
): RawFrontendModel {
  const author = slug.split("/")[0] ?? "anthropic";
  return {
    slug,
    permaslug: `${slug}-20260301`,
    name: slug,
    short_name: slug.split("/")[1] ?? slug,
    author,
    author_display_name: author,
    context_length: 200_000,
    knowledge_cutoff: "2026-01-01",
    supports_reasoning: false,
    input_modalities: ["text"],
    output_modalities: ["text"],
    endpoint: {
      pricing: { prompt: "0.000003", completion: "0.000015", web_search: null },
    },
    created_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function mkResp(slugs: string[]): RawFrontendResponse {
  return { data: { models: slugs.map((s) => mkRaw(s)) } };
}

// Pad to ≥100 models so we don't trip the sanity-floor warning in the
// tests that aren't asserting on it.
function padToSanity(models: RawFrontendModel[]): RawFrontendModel[] {
  const out = [...models];
  while (out.length < 110) {
    out.push(mkRaw(`anthropic/filler-${out.length}`));
  }
  return out;
}

function mkPaddedResp(slugs: string[]): RawFrontendResponse {
  return { data: { models: padToSanity(slugs.map((s) => mkRaw(s))) } };
}

describe("assembleModelUsage", () => {
  it("returns catalogue-fallback ordering when frontend errored", () => {
    const dto = assembleModelUsage({
      primary: null,
      catalogue: { data: padToSanity([mkRaw("anthropic/claude-sonnet-4.6")]) },
      frontendErrored: true,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.ordering).toBe("catalogue-fallback");
    expect(dto.rows.length).toBeGreaterThan(0);
    expect(dto.sourceCaveat).toBe(OPENROUTER_SOURCE_CAVEAT);
  });

  it("returns top-weekly ordering when frontend OK", () => {
    const dto = assembleModelUsage({
      primary: mkPaddedResp([
        "anthropic/claude-sonnet-4.6",
        "deepseek/deepseek-v3.2",
      ]),
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.ordering).toBe("top-weekly");
    expect(dto.rows[0].slug).toBe("anthropic/claude-sonnet-4.6");
    expect(dto.rows[0].rank).toBe(1);
    expect(dto.rows[1].rank).toBe(2);
  });

  it("preserves null pricing when source pricing missing", () => {
    const dto = assembleModelUsage({
      primary: {
        data: {
          models: padToSanity([
            mkRaw("anthropic/no-price", { endpoint: null, pricing: null }),
          ]),
        },
      },
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    const row = dto.rows.find((r) => r.slug === "anthropic/no-price");
    expect(row).toBeDefined();
    expect(row!.pricing.promptPerMTok).toBeNull();
    expect(row!.pricing.completionPerMTok).toBeNull();
    expect(row!.pricing.webSearchPerCall).toBeNull();
  });

  it("parses string-decimal pricing into per-1M-token dollars", () => {
    const dto = assembleModelUsage({
      primary: {
        data: {
          models: padToSanity([
            mkRaw("anthropic/p", {
              endpoint: {
                pricing: {
                  prompt: "0.000003", // $3 per 1M
                  completion: "0.000015", // $15 per 1M
                  web_search: "0.01",
                },
              },
            }),
          ]),
        },
      },
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    const row = dto.rows.find((r) => r.slug === "anthropic/p")!;
    expect(row.pricing.promptPerMTok).toBe(3);
    expect(row.pricing.completionPerMTok).toBe(15);
    expect(row.pricing.webSearchPerCall).toBe(0.01);
  });

  it("flags top-1 author outside the major-lab allowlist", () => {
    const dto = assembleModelUsage({
      primary: mkPaddedResp(["unknown-vendor/strange-model"]),
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.sanityWarnings.length).toBeGreaterThan(0);
    expect(dto.sanityWarnings[0]).toMatch(/unknown-vendor/);
  });

  it("flags model count below sanity floor", () => {
    const dto = assembleModelUsage({
      primary: { data: { models: [mkRaw("anthropic/only")] } },
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.sanityWarnings.some((w) => w.includes("below sanity floor"))).toBe(true);
  });

  it("flags model count above sanity ceiling", () => {
    const tooMany = Array.from({ length: 1600 }, (_, i) =>
      mkRaw(`anthropic/m-${i}`),
    );
    const dto = assembleModelUsage({
      primary: { data: { models: tooMany } },
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.sanityWarnings.some((w) => w.includes("above sanity ceiling"))).toBe(true);
  });

  it("returns clean sanityWarnings when top-1 is a known major lab", () => {
    const dto = assembleModelUsage({
      primary: mkPaddedResp(["openai/gpt-5.5"]),
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.sanityWarnings).toEqual([]);
  });

  it("trendingDiffersFromTopWeekly false when secondary missing", () => {
    const dto = assembleModelUsage({
      primary: mkPaddedResp(["openai/gpt-5.5"]),
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.trendingDiffersFromTopWeekly).toBe(false);
  });

  it("trendingDiffersFromTopWeekly true when ≥3 of top-10 differ", () => {
    const top = mkPaddedResp([
      "anthropic/a",
      "anthropic/b",
      "anthropic/c",
      "anthropic/d",
      "anthropic/e",
      "anthropic/f",
      "anthropic/g",
      "anthropic/h",
      "anthropic/i",
      "anthropic/j",
    ]);
    const trending = mkPaddedResp([
      // 3 of these are not in `top` top-10: x/y/z
      "anthropic/a",
      "anthropic/b",
      "anthropic/c",
      "anthropic/d",
      "anthropic/e",
      "anthropic/f",
      "anthropic/g",
      "openai/x",
      "openai/y",
      "openai/z",
    ]);
    const dto = assembleModelUsage({
      primary: top,
      secondary: trending,
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.trendingDiffersFromTopWeekly).toBe(true);
  });

  it("trendingDiffersFromTopWeekly false when only 2 of top-10 differ", () => {
    const top = mkPaddedResp([
      "anthropic/a","anthropic/b","anthropic/c","anthropic/d","anthropic/e",
      "anthropic/f","anthropic/g","anthropic/h","anthropic/i","anthropic/j",
    ]);
    const trending = mkPaddedResp([
      "anthropic/a","anthropic/b","anthropic/c","anthropic/d","anthropic/e",
      "anthropic/f","anthropic/g","anthropic/h","openai/x","openai/y",
    ]);
    const dto = assembleModelUsage({
      primary: top,
      secondary: trending,
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.trendingDiffersFromTopWeekly).toBe(false);
  });

  it("respects limit parameter", () => {
    const dto = assembleModelUsage({
      primary: mkPaddedResp(["openai/gpt-5.5"]),
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      limit: 5,
      now: fixedClock,
    });
    expect(dto.rows.length).toBe(5);
  });

  it("uses generatedAt from the injected clock", () => {
    const dto = assembleModelUsage({
      primary: mkPaddedResp(["openai/gpt-5.5"]),
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.generatedAt).toBe(FIXED_NOW.toISOString());
  });

  it("hubUrl is the canonical OpenRouter model page", () => {
    const dto = assembleModelUsage({
      primary: mkPaddedResp(["anthropic/claude-sonnet-4.6"]),
      frontendErrored: false,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.rows[0].hubUrl).toBe(
      "https://openrouter.ai/anthropic/claude-sonnet-4.6",
    );
  });

  it("falls back to catalogue ordered by recency when frontendErrored AND models[] empty", () => {
    const cat: RawCatalogueResponse = {
      data: padToSanity([
        mkRaw("z/older", { created_at: "2025-01-01T00:00:00Z" }),
        mkRaw("a/newer", { created_at: "2026-04-01T00:00:00Z" }),
      ]),
    };
    const dto = assembleModelUsage({
      primary: { data: { models: [] } },
      catalogue: cat,
      frontendErrored: true,
      primaryOrdering: "top-weekly",
      now: fixedClock,
    });
    expect(dto.ordering).toBe("catalogue-fallback");
    expect(dto.rows[0].slug).toBe("a/newer");
  });
});

describe("parsePricing", () => {
  it("returns all-null when both endpoint.pricing and pricing are absent", () => {
    const out = parsePricing(mkRaw("a/b", { endpoint: null, pricing: null }));
    expect(out).toEqual({
      promptPerMTok: null,
      completionPerMTok: null,
      webSearchPerCall: null,
    });
  });

  it("reads pricing from top-level when endpoint.pricing is null", () => {
    const out = parsePricing(
      mkRaw("a/b", {
        endpoint: null,
        pricing: { prompt: "0.000002", completion: "0.000010", web_search: null },
      }),
    );
    expect(out.promptPerMTok).toBe(2);
    expect(out.completionPerMTok).toBe(10);
    expect(out.webSearchPerCall).toBeNull();
  });

  it("rejects non-finite numeric pricing as null", () => {
    const out = parsePricing(
      mkRaw("a/b", {
        endpoint: { pricing: { prompt: Infinity, completion: NaN, web_search: null } },
      }),
    );
    expect(out.promptPerMTok).toBeNull();
    expect(out.completionPerMTok).toBeNull();
  });

  it("treats empty string as null, not 0", () => {
    const out = parsePricing(
      mkRaw("a/b", {
        endpoint: { pricing: { prompt: "", completion: "", web_search: "" } },
      }),
    );
    expect(out.promptPerMTok).toBeNull();
    expect(out.completionPerMTok).toBeNull();
    expect(out.webSearchPerCall).toBeNull();
  });
});

describe("computeTopKTurnover", () => {
  it("returns 0 for empty inputs", () => {
    expect(computeTopKTurnover([], ["a", "b", "c"])).toBe(0);
    expect(computeTopKTurnover(["a", "b"], [])).toBe(0);
  });

  it("counts how many of today's top-K are absent from yesterday's top-K", () => {
    expect(
      computeTopKTurnover(
        ["a", "b", "c", "d", "e"],
        ["a", "b", "c", "d", "e"],
      ),
    ).toBe(0);
    expect(
      computeTopKTurnover(
        ["a", "b", "c", "x", "y"],
        ["a", "b", "c", "d", "e"],
      ),
    ).toBe(2);
    expect(
      computeTopKTurnover(
        ["x", "y", "z", "a", "b"],
        ["a", "b", "c", "d", "e"],
      ),
    ).toBe(3);
  });
});

describe("MAJOR_LAB_AUTHORS allowlist sanity", () => {
  it("contains the labs that show up in the live OpenRouter top-5", () => {
    expect(MAJOR_LAB_AUTHORS).toContain("anthropic");
    expect(MAJOR_LAB_AUTHORS).toContain("openai");
    expect(MAJOR_LAB_AUTHORS).toContain("deepseek");
    expect(MAJOR_LAB_AUTHORS).toContain("moonshotai");
    expect(MAJOR_LAB_AUTHORS).toContain("google");
  });
});
