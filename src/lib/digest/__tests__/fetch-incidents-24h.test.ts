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
  it("calls all four status-page fetches in parallel with days=2 and returns the current24h list", async () => {
    const fetcher = vi.fn(async (args: { incidentsApiUrl: string; days?: number }) => {
      // Return a distinct incident per source so we can assert coverage
      return [mkIncident(args.incidentsApiUrl.slice(0, 20), "2026-04-22T00:00:00Z")];
    });
    const now = Date.parse("2026-04-22T08:00:00Z");
    const result = await fetchIncidents24h({ fetcher, now });

    expect(fetcher).toHaveBeenCalledTimes(4);
    // Each fetcher call must request 2 days so we get the prior window
    // for the "vs N yesterday" baseline in one round-trip per source.
    for (const call of fetcher.mock.calls) {
      expect(call[0].days).toBe(2);
    }
    expect(result.current24h).toHaveLength(4);
    expect(result.priorCount).toBe(0);
  });

  it("partitions incidents into current24h vs priorCount by createdAt", async () => {
    const nowIso = "2026-04-22T08:00:00Z";
    const now = Date.parse(nowIso);
    const fetcher = vi.fn(async () => [
      mkIncident("recent", "2026-04-22T04:00:00Z"), // 4h ago → current
      mkIncident("edge", "2026-04-21T08:00:00Z"), // exactly 24h ago → current (inclusive)
      mkIncident("yesterday", "2026-04-21T04:00:00Z"), // 28h ago → prior
      mkIncident("ancient", "2026-04-19T04:00:00Z"), // 76h ago → dropped
    ]);
    const result = await fetchIncidents24h({ fetcher, now });
    // 4 sources × {2 current, 1 prior, 1 dropped}
    expect(result.current24h).toHaveLength(8);
    expect(result.priorCount).toBe(4);
    const ids = new Set(result.current24h.map((i) => i.id));
    expect(ids.has("recent")).toBe(true);
    expect(ids.has("edge")).toBe(true);
    expect(ids.has("yesterday")).toBe(false);
  });

  it("returns empty current24h when one fetcher throws — other sources still contribute", async () => {
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
    expect(result.current24h).toHaveLength(3);
    expect(result.priorCount).toBe(0);
  });

  it("skips incidents with unparseable createdAt in both windows", async () => {
    const fetcher = vi.fn(async () => [
      mkIncident("bad", "not-a-date"),
      mkIncident("good", "2026-04-22T04:00:00Z"),
    ]);
    const result = await fetchIncidents24h({
      fetcher,
      now: Date.parse("2026-04-22T08:00:00Z"),
    });
    // 4 sources × 1 kept = 4
    expect(result.current24h).toHaveLength(4);
    expect(result.priorCount).toBe(0);
  });
});
