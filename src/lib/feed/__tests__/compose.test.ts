import { describe, expect, it } from "vitest";
import { composeFeed } from "@/lib/feed/compose";
import type { StatusResult } from "@/lib/data/fetch-status";
import type { ModelUsageDto } from "@/lib/data/openrouter-types";
import type { SdkAdoptionDto } from "@/lib/data/sdk-adoption";
import type { HnWireResult } from "@/lib/data/wire-hn";
import type { ResearchResult } from "@/lib/data/fetch-research";
import type { LabsPayload } from "@/lib/data/fetch-labs";

const NOW = new Date("2026-04-27T12:00:00.000Z").getTime();

function emptyStatus(): StatusResult {
  return { data: {}, polledAt: "2026-04-27T12:00:00.000Z", failures: [] };
}
function emptyModels(): ModelUsageDto {
  return {
    ordering: "top-weekly",
    generatedAt: "2026-04-27T12:00:00.000Z",
    fetchedAt: "2026-04-27T12:00:00.000Z",
    rows: [],
    trendingDiffersFromTopWeekly: false,
    sanityWarnings: [],
    sourceCaveat: "",
  };
}
function emptySdk(): SdkAdoptionDto {
  return { packages: [], generatedAt: "2026-04-27T12:00:00.000Z" };
}
function emptyHn(): HnWireResult {
  return {
    ok: true,
    items: [],
    points: [],
    polledAt: "2026-04-27T12:00:00.000Z",
    coverage: { itemsTotal: 0, itemsWithLocation: 0, geocodeResolutionPct: 0 },
    meta: { lastFetchOkTs: null, staleMinutes: null },
    source: "redis",
  };
}
function emptyResearch(): ResearchResult {
  return { ok: true, papers: [], generatedAt: "2026-04-27T12:00:00.000Z" };
}
function emptyLabs(): LabsPayload {
  return { labs: [], generatedAt: "2026-04-27T12:00:00.000Z", failures: [] };
}

describe("composeFeed", () => {
  it("returns quietDay=true and zero cards when every snapshot is empty", () => {
    const out = composeFeed(
      {
        status: emptyStatus(),
        models: emptyModels(),
        sdk: emptySdk(),
        hn: emptyHn(),
        research: emptyResearch(),
        labs: emptyLabs(),
      },
      NOW,
    );
    expect(out.cards).toEqual([]);
    expect(out.quietDay).toBe(true);
    expect(out.currentState).toBeDefined();
  });

  it("returns quietDay=false when at least one severity-100 card is fresh", () => {
    const out = composeFeed(
      {
        status: {
          data: {
            "claude-code": {
              status: "major_outage",
              statusSourceId: "anthropic-status",
              lastCheckedAt: "2026-04-27T11:55:00.000Z",
            },
          },
          polledAt: "2026-04-27T12:00:00.000Z",
          failures: [],
        },
        models: emptyModels(),
        sdk: emptySdk(),
        hn: emptyHn(),
        research: emptyResearch(),
        labs: emptyLabs(),
      },
      NOW,
    );
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0].severity).toBe(100);
    expect(out.quietDay).toBe(false);
  });

  it("ranks cards across sources: severity desc, then timestamp desc", () => {
    const out = composeFeed(
      {
        status: {
          data: {
            "claude-code": {
              status: "degraded",
              statusSourceId: "anthropic-status",
              lastCheckedAt: "2026-04-27T11:00:00.000Z",
            },
          },
          polledAt: "2026-04-27T12:00:00.000Z",
          failures: [],
        },
        models: emptyModels(),
        sdk: emptySdk(),
        hn: emptyHn(),
        research: {
          ok: true,
          papers: [
            {
              id: "2604.00001v1",
              title: "P1",
              authors: ["A"],
              published: "2026-04-27T10:00:00.000Z",
              updated: "2026-04-27T10:00:00.000Z",
              primaryCategory: "cs.AI",
              categories: ["cs.AI"],
              abstractUrl: "https://arxiv.org/abs/2604.00001v1",
            },
          ],
          generatedAt: "2026-04-27T12:00:00.000Z",
        },
        labs: emptyLabs(),
      },
      NOW,
    );
    expect(out.cards.map((c) => c.severity)).toEqual([100, 20]);
  });

  it("populates currentState even when all derivers return zero cards", () => {
    const out = composeFeed(
      {
        status: emptyStatus(),
        models: emptyModels(),
        sdk: emptySdk(),
        hn: emptyHn(),
        research: emptyResearch(),
        labs: emptyLabs(),
      },
      NOW,
    );
    expect(out.currentState).toEqual(
      expect.objectContaining({
        topModel: expect.any(Object),
        toolHealth: expect.any(Object),
        latestPaper: expect.any(Object),
      }),
    );
  });

  it("lastComputed is the provided nowMs as ISO", () => {
    const out = composeFeed(
      {
        status: emptyStatus(),
        models: emptyModels(),
        sdk: emptySdk(),
        hn: emptyHn(),
        research: emptyResearch(),
        labs: emptyLabs(),
      },
      NOW,
    );
    expect(out.lastComputed).toBe("2026-04-27T12:00:00.000Z");
  });
});
