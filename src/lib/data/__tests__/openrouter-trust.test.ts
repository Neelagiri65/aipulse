import { describe, expect, it } from "vitest";

import { runOpenRouterIngest } from "@/lib/data/openrouter-ingest";
import { deriveModelMoverCards } from "@/lib/feed/derivers/model-mover";
import { checkResolvableSource } from "@/lib/trust/invariants";
import type { FetchOpenRouterRankingsResult } from "@/lib/data/openrouter-fetch";
import type {
  ModelUsageDto,
  ModelUsageSnapshotRow,
} from "@/lib/data/openrouter-types";
import type { OpenRouterStore } from "@/lib/data/openrouter-store";

/**
 * END-TO-END trust test reconstructing the S91 incident: the day the
 * OpenRouter endpoint move was fixed, the first top-weekly run diffed
 * today's ranks against a `catalogue-fallback` (release-recency, NOT a
 * usage ranking) prior snapshot and manufactured 17 fabricated
 * MODEL_MOVER cards (deltas up to 69) LIVE on prod.
 *
 * The invariant, asserted at the OUTPUT of the real chain
 * (runOpenRouterIngest → written DTO → deriveModelMoverCards): a rank
 * delta may ONLY be diffed against a like-ordered (top-weekly) baseline;
 * an unlike-ordered prior yields previousRank=null → ZERO movers. The
 * per-function tests never asserted this end-to-end — this does.
 */

const NOW = new Date("2026-07-05T12:00:00Z");
const clock = () => NOW;

function mkRawModel(slug: string) {
  const author = slug.split("/")[0] ?? "anthropic";
  return {
    slug,
    permaslug: `${slug}-1`,
    name: slug,
    short_name: slug,
    author,
    author_display_name: author,
    context_length: 200_000,
    knowledge_cutoff: "2026-01-01",
    supports_reasoning: false,
    input_modalities: ["text"],
    output_modalities: ["text"],
    endpoint: { pricing: { prompt: "0.000003", completion: "0.000015", web_search: null } },
    created_at: "2026-03-01T00:00:00Z",
  };
}

/** Fresh top-weekly response with a deliberately DIFFERENT slug order than
 *  the fallback baseline — so a naive diff would manufacture large deltas. */
function freshTopWeekly(): FetchOpenRouterRankingsResult {
  const order = [
    "deepseek/deepseek-v4-flash",
    "xiaomi/mimo-v2.5",
    "minimax/minimax-m3",
    "anthropic/claude-opus-4-8",
    "openai/gpt-6",
  ];
  const models = order.map(mkRawModel);
  while (models.length < 110) models.push(mkRawModel(`filler/m-${models.length}`));
  return {
    primary: { data: { models } },
    secondary: null,
    catalogue: null,
    frontendErrored: false,
    secondaryErrored: false,
    fetchedAt: NOW.toISOString(),
  };
}

function storeWithPriorSnapshot(
  ordering: ModelUsageSnapshotRow["ordering"],
): OpenRouterStore & { written: { dto: ModelUsageDto | null } } {
  const written = { dto: null as ModelUsageDto | null };
  const snapshots: Record<string, ModelUsageSnapshotRow> = {
    // Yesterday's snapshot — REVERSED order, so a diff against it would
    // produce huge fabricated deltas if the ordering guard were absent.
    "2026-07-04": {
      date: "2026-07-04",
      ordering,
      slugs: [
        "openai/gpt-6",
        "anthropic/claude-opus-4-8",
        "minimax/minimax-m3",
        "xiaomi/mimo-v2.5",
        "deepseek/deepseek-v4-flash",
      ],
    },
  };
  return {
    written,
    async writeRankingsLatest(dto) {
      written.dto = dto;
    },
    async readRankingsLatest() {
      return written.dto;
    },
    async writeDailySnapshotIfAbsent() {
      return true;
    },
    async readSnapshots() {
      return { ...snapshots };
    },
  };
}

describe("model-usage — S91 fabrication guard (end-to-end)", () => {
  it("THE INCIDENT: an unlike-ordered (catalogue-fallback) prior yields ZERO movers", async () => {
    const store = storeWithPriorSnapshot("catalogue-fallback");
    await runOpenRouterIngest({
      fetchRankings: async () => freshTopWeekly(),
      store,
      now: clock,
    });
    const dto = store.written.dto!;
    // Invariant 1: no row carries a previousRank derived from the bad baseline.
    expect(dto.rows.every((r) => r.previousRank === null)).toBe(true);
    // Invariant 2: therefore NO MODEL_MOVER card can be fabricated.
    expect(deriveModelMoverCards(dto)).toEqual([]);
  });

  it("a LIKE-ordered (top-weekly) prior legitimately produces movers", async () => {
    const store = storeWithPriorSnapshot("top-weekly");
    await runOpenRouterIngest({
      fetchRankings: async () => freshTopWeekly(),
      store,
      now: clock,
    });
    const dto = store.written.dto!;
    // Baseline is valid, so ranks diff and real movement is allowed.
    expect(dto.rows.some((r) => r.previousRank !== null)).toBe(true);
    // Movers may now legitimately fire (the reversed order = real moves).
    expect(deriveModelMoverCards(dto).length).toBeGreaterThan(0);
  });

  it("A/V: every emitted MODEL_MOVER card carries a resolvable source (real ingest → real deriver)", async () => {
    const store = storeWithPriorSnapshot("top-weekly");
    await runOpenRouterIngest({
      fetchRankings: async () => freshTopWeekly(),
      store,
      now: clock,
    });
    const cards = deriveModelMoverCards(store.written.dto!);
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect
        .soft(checkResolvableSource(c.sourceUrl), `"${c.headline}" -> ${c.sourceUrl}`)
        .toBeNull();
      expect.soft(c.sourceName, `"${c.headline}" has no sourceName`).toBeTruthy();
    }
  });
});
