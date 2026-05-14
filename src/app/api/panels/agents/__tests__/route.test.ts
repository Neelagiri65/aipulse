/**
 * /api/panels/agents handler — read endpoint for the dashboard panel.
 *
 * Verifies:
 *   1. Pulls the 7d-old snapshot date deterministically from the
 *      injected `now` so the panel's delta column reflects the same
 *      day used by the digest section.
 *   2. Returns null DTO + no-store cache when agents:latest is missing
 *      (cron hasn't seeded), so the empty state isn't cached at edge.
 *   3. Returns the assembled DTO + 5-min CDN cache when latest exists,
 *      regardless of whether the 7d-old snapshot is present (delta
 *      becomes "bootstrap" on day 1-7, then "fresh" from day 8).
 */

import { describe, it, expect, vi } from "vitest";
import { handleGetAgentsPanel } from "@/app/api/panels/agents/route";
import type { AgentFetchResult } from "@/lib/data/agents-fetch";

const NOW = new Date("2026-05-10T07:00:00Z");

function fetchResult(
  fetchedAt: string,
  rows: Array<{
    id: string;
    weekly?: number | null;
    stars?: number | null;
    pushed?: string | null;
    archived?: boolean | null;
  }>,
): AgentFetchResult {
  return {
    fetchedAt,
    frameworks: rows.map((r) => ({
      id: r.id,
      pypiWeeklyDownloads: r.weekly ?? null,
      npmWeeklyDownloads: null,
      weeklyDownloads: r.weekly ?? null,
      stars: r.stars ?? 1000,
      openIssues: 10,
      pushedAt: r.pushed ?? "2026-05-10T00:00:00Z",
      archived: r.archived ?? false,
      pypiStaleSince: null,
      npmStaleSince: null,
      githubStaleSince: null,
      fetchErrors: [],
    })),
  };
}

describe("handleGetAgentsPanel", () => {
  it("returns null DTO + no-store cache when agents:latest is missing", async () => {
    const readLatest = vi.fn(async () => null);
    const readSnapshot = vi.fn(async () => null);
    const result = await handleGetAgentsPanel({
      readLatest,
      readSnapshot,
      now: () => NOW,
    });
    expect(result.dto).toBeNull();
    expect(result.cacheHeader).toBe("no-store");
    expect(readLatest).toHaveBeenCalledTimes(1);
  });

  it("reads the 7d-old snapshot keyed by today-7 in UTC", async () => {
    const readLatest = vi.fn(async () =>
      fetchResult("2026-05-10T06:30:00Z", [{ id: "crewai", weekly: 1000 }]),
    );
    const readSnapshot = vi.fn(async () =>
      fetchResult("2026-05-03T06:30:00Z", [{ id: "crewai", weekly: 800 }]),
    );
    await handleGetAgentsPanel({
      readLatest,
      readSnapshot,
      now: () => NOW,
    });
    expect(readSnapshot).toHaveBeenCalledWith("2026-05-03");
  });

  it("returns assembled DTO + 5-min CDN cache when both blobs are present", async () => {
    const readLatest = vi.fn(async () =>
      fetchResult("2026-05-10T06:30:00Z", [{ id: "crewai", weekly: 1100 }]),
    );
    const readSnapshot = vi.fn(async () =>
      fetchResult("2026-05-03T06:30:00Z", [{ id: "crewai", weekly: 1000 }]),
    );
    const result = await handleGetAgentsPanel({
      readLatest,
      readSnapshot,
      now: () => NOW,
    });
    expect(result.dto).not.toBeNull();
    expect(result.cacheHeader).toBe(
      "public, s-maxage=300, stale-while-revalidate=60",
    );
    const crew = result.dto!.rows.find((r) => r.id === "crewai");
    expect(crew?.deltaState).toBe("fresh");
    expect(crew?.weeklyDeltaPct).toBeCloseTo(10, 5);
  });

  it("bootstrap mode: missing 7d-old snapshot still returns DTO with delta=null", async () => {
    const readLatest = vi.fn(async () =>
      fetchResult("2026-05-10T06:30:00Z", [{ id: "crewai", weekly: 1100 }]),
    );
    const readSnapshot = vi.fn(async () => null);
    const result = await handleGetAgentsPanel({
      readLatest,
      readSnapshot,
      now: () => NOW,
    });
    expect(result.dto).not.toBeNull();
    expect(result.cacheHeader).toBe(
      "public, s-maxage=300, stale-while-revalidate=60",
    );
    const crew = result.dto!.rows.find((r) => r.id === "crewai");
    expect(crew?.deltaState).toBe("bootstrap");
    expect(crew?.weeklyDeltaPct).toBeNull();
  });
});
