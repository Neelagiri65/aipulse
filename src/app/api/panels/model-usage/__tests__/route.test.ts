import { describe, expect, it } from "vitest";
import { handleGetModelUsage } from "@/app/api/panels/model-usage/route";
import { OPENROUTER_SOURCE_CAVEAT, type ModelUsageDto } from "@/lib/data/openrouter-types";
import type { OpenRouterStore } from "@/lib/data/openrouter-store";

const FIXED_NOW = new Date("2026-04-26T12:00:00Z");
const fixedClock = () => FIXED_NOW;

function mkRow(slug: string, rank: number) {
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
    knowledgeCutoff: "2026-01-01",
    supportsReasoning: false,
    modalitiesIn: ["text"],
    modalitiesOut: ["text"],
    hubUrl: `https://openrouter.ai/${slug}`,
  };
}

function mkStored(rowCount = 50): ModelUsageDto {
  const slugs = Array.from({ length: rowCount }, (_, i) => `anthropic/m-${i}`);
  return {
    ordering: "top-weekly",
    generatedAt: FIXED_NOW.toISOString(),
    fetchedAt: FIXED_NOW.toISOString(),
    rows: slugs.map((s, i) => mkRow(s, i + 1)),
    trendingDiffersFromTopWeekly: false,
    sanityWarnings: [],
    sourceCaveat: OPENROUTER_SOURCE_CAVEAT,
  };
}

function mkStore(stored: ModelUsageDto | null): OpenRouterStore {
  return {
    async writeRankingsLatest() {},
    async readRankingsLatest() {
      return stored;
    },
    async writeDailySnapshotIfAbsent() {
      return false;
    },
    async readSnapshots() {
      return {};
    },
  };
}

function mkRequest(qs = ""): Request {
  return new Request(`http://x/api/panels/model-usage${qs ? `?${qs}` : ""}`);
}

describe("GET /api/panels/model-usage", () => {
  it("happy path: serves the stored DTO trimmed to default limit", async () => {
    const { dto, cacheHeader } = await handleGetModelUsage(mkRequest(), {
      store: mkStore(mkStored(50)),
      now: fixedClock,
    });
    expect(dto.rows.length).toBe(30);
    expect(dto.rows[0].slug).toBe("anthropic/m-0");
    expect(cacheHeader).toBe("public, s-maxage=300, stale-while-revalidate=60");
  });

  it("respects limit query param", async () => {
    const { dto } = await handleGetModelUsage(mkRequest("limit=5"), {
      store: mkStore(mkStored(50)),
      now: fixedClock,
    });
    expect(dto.rows.length).toBe(5);
  });

  it("clamps limit above 100 to 100", async () => {
    const { dto } = await handleGetModelUsage(mkRequest("limit=500"), {
      store: mkStore(mkStored(50)),
      now: fixedClock,
    });
    expect(dto.rows.length).toBe(50); // 50 stored, clamped at the data ceiling
  });

  it("clamps limit below 1 to 1", async () => {
    const { dto } = await handleGetModelUsage(mkRequest("limit=0"), {
      store: mkStore(mkStored(50)),
      now: fixedClock,
    });
    expect(dto.rows.length).toBe(1);
  });

  it("ignores non-integer limit", async () => {
    const { dto } = await handleGetModelUsage(mkRequest("limit=abc"), {
      store: mkStore(mkStored(50)),
      now: fixedClock,
    });
    expect(dto.rows.length).toBe(30);
  });

  it("returns empty fallback DTO when store has nothing", async () => {
    const { dto } = await handleGetModelUsage(mkRequest(), {
      store: mkStore(null),
      now: fixedClock,
    });
    expect(dto.rows.length).toBe(0);
    expect(dto.ordering).toBe("catalogue-fallback");
    expect(dto.sourceCaveat).toBe(OPENROUTER_SOURCE_CAVEAT);
    expect(dto.generatedAt).toBe(FIXED_NOW.toISOString());
  });

  it("preserves the assembler-computed sanity warnings", async () => {
    const stored = mkStored(50);
    stored.sanityWarnings = ["test warning"];
    const { dto } = await handleGetModelUsage(mkRequest(), {
      store: mkStore(stored),
      now: fixedClock,
    });
    expect(dto.sanityWarnings).toEqual(["test warning"]);
  });
});
