import { describe, expect, it, vi } from "vitest";
import {
  runOpenRouterIngest,
  SNAPSHOT_TOP_N,
} from "@/lib/data/openrouter-ingest";
import type { FetchOpenRouterRankingsResult } from "@/lib/data/openrouter-fetch";
import type {
  ModelUsageDto,
  ModelUsageSnapshotRow,
} from "@/lib/data/openrouter-types";
import type { OpenRouterStore } from "@/lib/data/openrouter-store";

const FIXED_NOW = new Date("2026-04-26T12:00:00Z");
const fixedClock = () => FIXED_NOW;

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

function padToSanity(slugs: string[]): { slug: string }[] {
  const arr = slugs.map((s) => mkRawModel(s));
  while (arr.length < 110) arr.push(mkRawModel(`anthropic/filler-${arr.length}`));
  return arr;
}

function mkFetched(
  overrides: Partial<FetchOpenRouterRankingsResult> = {},
): FetchOpenRouterRankingsResult {
  return {
    primary: { data: { models: padToSanity(["anthropic/claude-sonnet-4.6"]) } },
    secondary: null,
    catalogue: null,
    frontendErrored: false,
    secondaryErrored: false,
    fetchedAt: FIXED_NOW.toISOString(),
    ...overrides,
  };
}

function mkStore(): OpenRouterStore & {
  written: { dto: ModelUsageDto | null; snapshots: Record<string, ModelUsageSnapshotRow> };
  presentDates: Set<string>;
} {
  const written = {
    dto: null as ModelUsageDto | null,
    snapshots: {} as Record<string, ModelUsageSnapshotRow>,
  };
  const presentDates = new Set<string>();
  return {
    written,
    presentDates,
    async writeRankingsLatest(dto) {
      written.dto = dto;
    },
    async readRankingsLatest() {
      return written.dto;
    },
    async writeDailySnapshotIfAbsent(date, snapshot) {
      if (presentDates.has(date)) return false;
      presentDates.add(date);
      written.snapshots[date] = snapshot;
      return true;
    },
    async readSnapshots() {
      return { ...written.snapshots };
    },
  };
}

describe("runOpenRouterIngest", () => {
  it("happy path: writes DTO + appends new snapshot", async () => {
    const store = mkStore();
    const result = await runOpenRouterIngest({
      fetchRankings: async () => mkFetched(),
      store,
      now: fixedClock,
    });
    expect(result.ok).toBe(true);
    expect(result.ordering).toBe("top-weekly");
    expect(result.snapshotWritten).toBe(true);
    expect(result.date).toBe("2026-04-26");
    expect(store.written.dto?.rows[0]?.slug).toBe("anthropic/claude-sonnet-4.6");
    expect(store.written.snapshots["2026-04-26"]).toBeDefined();
    expect(store.written.snapshots["2026-04-26"].slugs[0]).toBe(
      "anthropic/claude-sonnet-4.6",
    );
  });

  it("does not duplicate the same UTC day's snapshot on a re-fire", async () => {
    const store = mkStore();
    store.presentDates.add("2026-04-26");
    store.written.snapshots["2026-04-26"] = {
      date: "2026-04-26",
      ordering: "top-weekly",
      slugs: ["anthropic/older"],
    };
    const result = await runOpenRouterIngest({
      fetchRankings: async () => mkFetched(),
      store,
      now: fixedClock,
    });
    expect(result.snapshotWritten).toBe(false);
    expect(store.written.snapshots["2026-04-26"].slugs[0]).toBe("anthropic/older");
  });

  it("flags reason 'frontend-degraded' when fallback path was used", async () => {
    const store = mkStore();
    const fetched = mkFetched({
      primary: null,
      catalogue: { data: padToSanity(["anthropic/cat-fallback"]) },
      frontendErrored: true,
    });
    const result = await runOpenRouterIngest({
      fetchRankings: async () => fetched,
      store,
      now: fixedClock,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("frontend-degraded");
    expect(result.ordering).toBe("catalogue-fallback");
    expect(store.written.dto?.ordering).toBe("catalogue-fallback");
  });

  it("caps snapshot to SNAPSHOT_TOP_N slugs", async () => {
    const slugs = Array.from({ length: 200 }, (_, i) => `anthropic/m-${i}`);
    const store = mkStore();
    await runOpenRouterIngest({
      fetchRankings: async () =>
        mkFetched({
          primary: { data: { models: padToSanity(slugs) } },
        }),
      store,
      now: fixedClock,
    });
    const snap = store.written.snapshots["2026-04-26"];
    expect(snap.slugs.length).toBe(SNAPSHOT_TOP_N);
  });

  it("does not write a snapshot when no rows were assembled", async () => {
    const store = mkStore();
    const result = await runOpenRouterIngest({
      fetchRankings: async () =>
        mkFetched({
          primary: null,
          catalogue: null,
          frontendErrored: true,
        }),
      store,
      now: fixedClock,
    });
    expect(result.snapshotWritten).toBe(false);
    expect(Object.keys(store.written.snapshots).length).toBe(0);
  });

  it("surfaces sanity warnings unchanged from the assembler", async () => {
    const store = mkStore();
    const result = await runOpenRouterIngest({
      fetchRankings: async () =>
        mkFetched({
          primary: { data: { models: padToSanity(["unknown-vendor/x"]) } },
        }),
      store,
      now: fixedClock,
    });
    expect(result.sanityWarnings.length).toBeGreaterThan(0);
    expect(result.sanityWarnings[0]).toMatch(/unknown-vendor/);
  });

  it("uses injected fetcher (does not call default network path)", async () => {
    const store = mkStore();
    const fetcher = vi.fn(async () => mkFetched());
    await runOpenRouterIngest({ fetchRankings: fetcher, store, now: fixedClock });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("seeds previousRank from yesterday's snapshot in the hash", async () => {
    const store = mkStore();
    // Pre-seed yesterday's snapshot with a different ranking — when
    // today writes, every row's previousRank should reflect this list.
    store.written.snapshots["2026-04-25"] = {
      date: "2026-04-25",
      ordering: "top-weekly",
      slugs: ["b/second", "anthropic/claude-sonnet-4.6"],
    };
    store.presentDates.add("2026-04-25");
    await runOpenRouterIngest({
      fetchRankings: async () => mkFetched(),
      store,
      now: fixedClock,
    });
    const dto = store.written.dto!;
    const sonnet = dto.rows.find((r) => r.slug === "anthropic/claude-sonnet-4.6")!;
    expect(sonnet.previousRank).toBe(2);
  });

  it("walks back up to 7 days when yesterday's snapshot is missing (cron-skip tolerance)", async () => {
    const store = mkStore();
    // Day-2 prior is the only known prior — composer should still find it.
    store.written.snapshots["2026-04-24"] = {
      date: "2026-04-24",
      ordering: "top-weekly",
      slugs: ["anthropic/claude-sonnet-4.6"],
    };
    store.presentDates.add("2026-04-24");
    await runOpenRouterIngest({
      fetchRankings: async () => mkFetched(),
      store,
      now: fixedClock,
    });
    const dto = store.written.dto!;
    const sonnet = dto.rows.find((r) => r.slug === "anthropic/claude-sonnet-4.6")!;
    expect(sonnet.previousRank).toBe(1);
  });

  it("leaves previousRank null on cold start (no prior snapshots)", async () => {
    const store = mkStore();
    await runOpenRouterIngest({
      fetchRankings: async () => mkFetched(),
      store,
      now: fixedClock,
    });
    const dto = store.written.dto!;
    for (const r of dto.rows) {
      expect(r.previousRank).toBeNull();
    }
  });
});
