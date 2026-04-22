import { describe, expect, it, vi } from "vitest";
import { fetchIncidents24h } from "@/lib/digest/fetch-incidents-24h";
import type { HistoricalIncident } from "@/lib/data/status-history";

function mkIncident(
  id: string,
  createdAt: string,
  overrides: Partial<HistoricalIncident> = {},
): HistoricalIncident {
  return {
    id,
    name: `Incident ${id}`,
    status: "resolved",
    impact: "minor",
    createdAt,
    ...overrides,
  };
}

describe("fetchIncidents24h", () => {
  it("calls all four status-page fetches in parallel and flattens", async () => {
    const fetcher = vi.fn(async (args: { incidentsApiUrl: string }) => {
      // Return a distinct incident per source so we can assert coverage
      return [mkIncident(args.incidentsApiUrl.slice(0, 20), "2026-04-22T00:00:00Z")];
    });
    const now = Date.parse("2026-04-22T08:00:00Z");
    const result = await fetchIncidents24h({ fetcher, now });

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(result).toHaveLength(4);
  });

  it("filters out incidents older than 24h relative to `now`", async () => {
    const nowIso = "2026-04-22T08:00:00Z";
    const now = Date.parse(nowIso);
    const fetcher = vi.fn(async () => [
      mkIncident("recent", "2026-04-22T04:00:00Z"), // 4h ago
      mkIncident("edge", "2026-04-21T08:00:00Z"), // exactly 24h ago — inclusive
      mkIncident("stale", "2026-04-20T08:00:00Z"), // 48h ago — excluded
    ]);
    const result = await fetchIncidents24h({ fetcher, now });
    // 4 sources × 3 incidents × (2 kept per source) = 8
    expect(result).toHaveLength(8);
    const ids = new Set(result.map((i) => i.id));
    expect(ids.has("recent")).toBe(true);
    expect(ids.has("edge")).toBe(true);
    expect(ids.has("stale")).toBe(false);
  });

  it("returns empty list when one fetcher throws — other sources still contribute", async () => {
    let call = 0;
    const fetcher = vi.fn(async () => {
      call += 1;
      if (call === 2) throw new Error("boom");
      return [mkIncident(`src-${call}`, "2026-04-22T04:00:00Z")];
    });
    const result = await fetchIncidents24h({
      fetcher,
      now: Date.parse("2026-04-22T08:00:00Z"),
    });
    expect(result).toHaveLength(3);
  });

  it("skips incidents with unparseable createdAt", async () => {
    const fetcher = vi.fn(async () => [
      mkIncident("bad", "not-a-date"),
      mkIncident("good", "2026-04-22T04:00:00Z"),
    ]);
    const result = await fetchIncidents24h({
      fetcher,
      now: Date.parse("2026-04-22T08:00:00Z"),
    });
    // 4 sources × 1 kept = 4
    expect(result).toHaveLength(4);
  });
});
