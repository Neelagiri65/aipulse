import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ModelUsageList,
  formatContextLength,
  formatPricing,
  sortRows,
} from "@/components/panels/model-usage/ModelUsageList";
import type { ModelUsageDto, ModelUsageRow } from "@/lib/data/openrouter-types";
import { OPENROUTER_SOURCE_CAVEAT } from "@/lib/data/openrouter-types";

function mkRow(
  rank: number,
  slug: string,
  overrides: Partial<ModelUsageRow> = {},
): ModelUsageRow {
  const author = slug.split("/")[0]!;
  return {
    rank,
    slug,
    permaslug: `${slug}-1`,
    name: slug,
    shortName: slug,
    author,
    authorDisplay: author,
    pricing: { promptPerMTok: 3, completionPerMTok: 15, webSearchPerCall: null },
    contextLength: 200_000,
    knowledgeCutoff: null,
    supportsReasoning: false,
    modalitiesIn: ["text"],
    modalitiesOut: ["text"],
    hubUrl: `https://openrouter.ai/${slug}`,
    ...overrides,
  };
}

function mkDto(rows: ModelUsageRow[]): ModelUsageDto {
  return {
    ordering: "top-weekly",
    generatedAt: "2026-04-26T00:00:00Z",
    fetchedAt: "2026-04-26T00:00:00Z",
    rows,
    trendingDiffersFromTopWeekly: false,
    sanityWarnings: [],
    sourceCaveat: OPENROUTER_SOURCE_CAVEAT,
  };
}

describe("ModelUsageList — rendering", () => {
  it("renders a row per model with the rank padded to 2 digits", () => {
    const html = renderToStaticMarkup(
      <ModelUsageList
        data={mkDto([
          mkRow(1, "anthropic/claude-sonnet-4.6"),
          mkRow(2, "deepseek/deepseek-v3.2"),
        ])}
      />,
    );
    expect(html).toContain(">01<");
    expect(html).toContain(">02<");
    expect(html).toContain("anthropic/claude-sonnet-4.6");
    expect(html).toContain("deepseek/deepseek-v3.2");
  });

  it("renders empty-state copy when rows is empty", () => {
    const html = renderToStaticMarkup(<ModelUsageList data={mkDto([])} />);
    expect(html).toContain("Collecting baseline");
    expect(html).toContain("first OpenRouter cron fire");
  });

  it("marks the focused slug with the row-focused class", () => {
    const html = renderToStaticMarkup(
      <ModelUsageList
        data={mkDto([mkRow(1, "anthropic/m-1"), mkRow(2, "openai/m-2")])}
        focusedSlug="openai/m-2"
      />,
    );
    // Class can appear before or after data-slug; assert both attributes are
    // on the same <li> by matching either order.
    expect(html).toMatch(
      /class="[^"]*row-focused[^"]*"[^>]*data-slug="openai\/m-2"|data-slug="openai\/m-2"[^>]*class="[^"]*row-focused/,
    );
  });

  it("renders pricing as $X / $Y format", () => {
    const html = renderToStaticMarkup(
      <ModelUsageList
        data={mkDto([
          mkRow(1, "anthropic/m", {
            pricing: { promptPerMTok: 3, completionPerMTok: 15, webSearchPerCall: null },
          }),
        ])}
      />,
    );
    expect(html).toContain("$3.0");
    expect(html).toContain("$15");
  });

  it("renders null pricing as em-dash", () => {
    const html = renderToStaticMarkup(
      <ModelUsageList
        data={mkDto([
          mkRow(1, "x/y", {
            pricing: { promptPerMTok: null, completionPerMTok: null, webSearchPerCall: null },
          }),
        ])}
      />,
    );
    expect(html).toContain("—");
  });
});

describe("sortRows", () => {
  const rows = [
    mkRow(1, "a/1", { contextLength: 200_000, pricing: { promptPerMTok: 3, completionPerMTok: 15, webSearchPerCall: null } }),
    mkRow(2, "b/2", { contextLength: 1_000_000, pricing: { promptPerMTok: 1, completionPerMTok: 5, webSearchPerCall: null } }),
    mkRow(3, "c/3", { contextLength: 32_000, pricing: { promptPerMTok: 10, completionPerMTok: 50, webSearchPerCall: null } }),
    mkRow(4, "d/4", { contextLength: 128_000, pricing: { promptPerMTok: null, completionPerMTok: null, webSearchPerCall: null } }),
  ];

  it("rank ordering preserves the stored rank", () => {
    const out = sortRows(rows, "rank");
    expect(out.map((r) => r.slug)).toEqual(["a/1", "b/2", "c/3", "d/4"]);
  });

  it("price-asc orders cheapest first; null sinks to the bottom", () => {
    const out = sortRows(rows, "price-asc");
    expect(out.map((r) => r.slug)).toEqual(["b/2", "a/1", "c/3", "d/4"]);
  });

  it("price-desc orders most expensive first; null still sinks", () => {
    const out = sortRows(rows, "price-desc");
    expect(out.map((r) => r.slug)).toEqual(["c/3", "a/1", "b/2", "d/4"]);
  });

  it("context-desc orders longest context first", () => {
    const out = sortRows(rows, "context-desc");
    expect(out.map((r) => r.slug)).toEqual(["b/2", "a/1", "d/4", "c/3"]);
  });
});

describe("formatPricing", () => {
  it("returns '—' for null", () => {
    expect(formatPricing(null)).toBe("—");
  });
  it("returns 'free' for 0", () => {
    expect(formatPricing(0)).toBe("free");
  });
  it("formats sub-dollar with two decimals", () => {
    expect(formatPricing(0.25)).toBe("$0.25");
  });
  it("formats single-dollar to one decimal", () => {
    expect(formatPricing(3.456)).toBe("$3.5");
  });
  it("rounds three-digit prices to whole dollars", () => {
    expect(formatPricing(125.7)).toBe("$126");
  });
});

describe("formatContextLength", () => {
  it("renders 1M for 1,000,000 tokens", () => {
    expect(formatContextLength(1_000_000)).toBe("1M");
  });
  it("renders 1.5M for fractional millions", () => {
    expect(formatContextLength(1_500_000)).toBe("1.5M");
  });
  it("renders K for thousands", () => {
    expect(formatContextLength(200_000)).toBe("200K");
    expect(formatContextLength(8_192)).toBe("8K");
  });
  it("renders raw count below 1K", () => {
    expect(formatContextLength(512)).toBe("512");
  });
});
