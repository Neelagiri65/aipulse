import { describe, expect, it } from "vitest";
import { deriveModelMoverCards } from "@/lib/feed/derivers/model-mover";
import type { ModelUsageDto, ModelUsageRow } from "@/lib/data/openrouter-types";

function row(
  partial: Partial<ModelUsageRow> & Pick<ModelUsageRow, "rank" | "slug">,
): ModelUsageRow {
  return {
    rank: partial.rank,
    previousRank: partial.previousRank ?? null,
    slug: partial.slug,
    permaslug: partial.permaslug ?? `${partial.slug}@1`,
    name: partial.name ?? partial.slug,
    shortName: partial.shortName ?? partial.slug,
    author: partial.author ?? "anthropic",
    authorDisplay: partial.authorDisplay ?? "Anthropic",
    pricing: partial.pricing ?? {
      promptPerMTok: null,
      completionPerMTok: null,
      webSearchPerCall: null,
    },
    contextLength: partial.contextLength ?? 200_000,
    knowledgeCutoff: partial.knowledgeCutoff ?? null,
    supportsReasoning: partial.supportsReasoning ?? false,
    modalitiesIn: partial.modalitiesIn ?? ["text"],
    modalitiesOut: partial.modalitiesOut ?? ["text"],
    hubUrl: partial.hubUrl ?? `https://openrouter.ai/${partial.slug}`,
  };
}

const baseDto: ModelUsageDto = {
  ordering: "top-weekly",
  generatedAt: "2026-04-28T00:45:00.000Z",
  fetchedAt: "2026-04-28T00:45:00.000Z",
  rows: [],
  trendingDiffersFromTopWeekly: false,
  sanityWarnings: [],
  sourceCaveat: "",
};

describe("deriveModelMoverCards", () => {
  it("returns no cards when previousRank is null (first read)", () => {
    const dto: ModelUsageDto = {
      ...baseDto,
      rows: [row({ rank: 1, slug: "anthropic/claude-sonnet-4.6", previousRank: null })],
    };
    expect(deriveModelMoverCards(dto)).toEqual([]);
  });

  it("does NOT fire when |delta| === 3 (boundary, threshold is strictly greater)", () => {
    const dto: ModelUsageDto = {
      ...baseDto,
      rows: [row({ rank: 5, slug: "anthropic/claude-sonnet-4.6", previousRank: 8 })],
    };
    expect(deriveModelMoverCards(dto)).toEqual([]);
  });

  it("fires when |delta| === 4 (just over threshold)", () => {
    const dto: ModelUsageDto = {
      ...baseDto,
      rows: [row({ rank: 4, slug: "anthropic/claude-sonnet-4.6", previousRank: 8 })],
    };
    const cards = deriveModelMoverCards(dto);
    expect(cards).toHaveLength(1);
    expect(cards[0].severity).toBe(80);
    expect(cards[0].type).toBe("MODEL_MOVER");
  });

  it("fires for both upward and downward moves", () => {
    const dto: ModelUsageDto = {
      ...baseDto,
      rows: [
        row({ rank: 2, slug: "rising/model", previousRank: 9 }), // up 7
        row({ rank: 15, slug: "falling/model", previousRank: 4 }), // down 11
      ],
    };
    const cards = deriveModelMoverCards(dto);
    expect(cards).toHaveLength(2);
  });

  it("populates sourceUrl from the model's OpenRouter hub URL", () => {
    const dto: ModelUsageDto = {
      ...baseDto,
      rows: [
        row({
          rank: 2,
          slug: "anthropic/claude-sonnet-4.6",
          previousRank: 9,
          hubUrl: "https://openrouter.ai/anthropic/claude-sonnet-4.6",
        }),
      ],
    };
    const cards = deriveModelMoverCards(dto);
    expect(cards[0].sourceUrl).toBe(
      "https://openrouter.ai/anthropic/claude-sonnet-4.6",
    );
    expect(cards[0].sourceName).toBe("OpenRouter");
  });

  it("uses fetchedAt as the card timestamp", () => {
    const dto: ModelUsageDto = {
      ...baseDto,
      fetchedAt: "2026-04-28T00:45:00.000Z",
      rows: [row({ rank: 2, slug: "x/y", previousRank: 9 })],
    };
    const cards = deriveModelMoverCards(dto);
    expect(cards[0].timestamp).toBe("2026-04-28T00:45:00.000Z");
  });

  it("returns [] on empty rows", () => {
    expect(deriveModelMoverCards({ ...baseDto, rows: [] })).toEqual([]);
  });
});
