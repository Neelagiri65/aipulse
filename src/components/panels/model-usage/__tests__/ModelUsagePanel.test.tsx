import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelUsagePanel } from "@/components/panels/model-usage/ModelUsagePanel";
import {
  OPENROUTER_SOURCE_CAVEAT,
  type ModelUsageDto,
  type ModelUsageRow,
} from "@/lib/data/openrouter-types";

function mkRow(rank: number, slug: string): ModelUsageRow {
  const author = slug.split("/")[0]!;
  return {
    rank,
    previousRank: rank,
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
  };
}

function mkDto(
  rows: ModelUsageRow[],
  overrides: Partial<ModelUsageDto> = {},
): ModelUsageDto {
  return {
    ordering: "top-weekly",
    generatedAt: "2026-04-26T12:00:00Z",
    fetchedAt: "2026-04-26T12:00:00Z",
    rows,
    trendingDiffersFromTopWeekly: false,
    sanityWarnings: [],
    sourceCaveat: OPENROUTER_SOURCE_CAVEAT,
    ...overrides,
  };
}

describe("ModelUsagePanel", () => {
  it("renders loading state when initial-load and no data", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={null}
        error={null}
        isInitialLoading={true}
        originUrl="https://gawk.dev"
      />,
    );
    expect(html).toContain("Loading the latest OpenRouter ranking");
  });

  it("renders error state with retry button when polled-endpoint failed", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={null}
        error="boom"
        isInitialLoading={false}
        originUrl="https://gawk.dev"
      />,
    );
    expect(html).toContain("Couldn");
    expect(html).toContain("Retry now");
    expect(html).toContain('role="alert"');
  });

  it("renders empty state when poll succeeded but no data yet", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={null}
        error={null}
        isInitialLoading={false}
        originUrl="https://gawk.dev"
      />,
    );
    expect(html).toContain("Collecting baseline");
  });

  it("renders the canonical caveat as a hover tooltip on the footer", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={mkDto([mkRow(1, "anthropic/m")])}
        error={null}
        isInitialLoading={false}
        originUrl="https://gawk.dev"
      />,
    );
    expect(html).toContain("OpenRouter request volume");
    expect(html).toContain("not end-user adoption");
  });

  it("renders the one-line footer with source link to OpenRouter rankings", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={mkDto([mkRow(1, "anthropic/m")])}
        error={null}
        isInitialLoading={false}
        originUrl="https://gawk.dev"
      />,
    );
    expect(html).toContain("OpenRouter reflects API-first developer spend");
    expect(html).toContain("Direct customers");
    expect(html).toContain('href="https://openrouter.ai/rankings"');
  });

  it("shows the catalogue-fallback banner when ordering is fallback", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={mkDto([mkRow(1, "anthropic/m")], {
          ordering: "catalogue-fallback",
        })}
        error={null}
        isInitialLoading={false}
        originUrl="https://gawk.dev"
      />,
    );
    expect(html).toContain("Fallback");
    expect(html).toContain("catalogue by recency");
    expect(html).toContain("Rankings restore automatically");
  });

  it("hides the trending deep-link when trendingDiffers is false", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={mkDto([mkRow(1, "anthropic/m")], {
          trendingDiffersFromTopWeekly: false,
        })}
        error={null}
        isInitialLoading={false}
        originUrl="https://gawk.dev"
      />,
    );
    expect(html).not.toContain("see OpenRouter trending");
  });

  it("shows the trending deep-link when trendingDiffers is true", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={mkDto([mkRow(1, "anthropic/m")], {
          trendingDiffersFromTopWeekly: true,
        })}
        error={null}
        isInitialLoading={false}
        originUrl="https://gawk.dev"
      />,
    );
    expect(html).toContain("see OpenRouter trending");
    expect(html).toContain("openrouter.ai/rankings");
  });

  it("does not surface the trending link when ordering is fallback", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={mkDto([mkRow(1, "anthropic/m")], {
          ordering: "catalogue-fallback",
          trendingDiffersFromTopWeekly: true,
        })}
        error={null}
        isInitialLoading={false}
        originUrl="https://gawk.dev"
      />,
    );
    expect(html).not.toContain("see OpenRouter trending");
  });

  it("seeds the drawer when initialFocusedSlug matches a row", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={mkDto([
          mkRow(1, "anthropic/claude-sonnet-4.6"),
          mkRow(2, "openai/gpt-5.5"),
        ])}
        error={null}
        isInitialLoading={false}
        originUrl="https://gawk.dev"
        initialFocusedSlug="openai/gpt-5.5"
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("https://openrouter.ai/openai/gpt-5.5");
  });

  it("does not open a drawer when initialFocusedSlug is unknown", () => {
    const html = renderToStaticMarkup(
      <ModelUsagePanel
        data={mkDto([mkRow(1, "anthropic/claude-sonnet-4.6")])}
        error={null}
        isInitialLoading={false}
        originUrl="https://gawk.dev"
        initialFocusedSlug="missing/slug"
      />,
    );
    expect(html).not.toContain('role="dialog"');
  });
});
