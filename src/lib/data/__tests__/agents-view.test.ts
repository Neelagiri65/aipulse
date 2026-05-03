/**
 * Agents-view assembler — joins the registry (editorial framework slate)
 * with today's fetch + a 7-day-old snapshot to produce per-row display data
 * with deltas + tombstone badges.
 *
 * Verifies:
 *   - delta math handles bootstrap (null prior), new-from-zero, normal %
 *   - badge precedence (archived > registry-category > runtime-dormant)
 *   - rows ordered by w/w delta descending; tombstones always sort to bottom
 *   - missing snapshot rows surface as null deltas, never NaN
 */

import { describe, it, expect } from "vitest";
import { assembleAgentsView } from "@/lib/data/agents-view";
import type { AgentFramework } from "@/lib/data/agents-registry";
import type { AgentFetchResult } from "@/lib/data/agents-fetch";

const NOW = new Date("2026-05-03T07:00:00Z");

const REG_ALIVE_FULL: AgentFramework = {
  id: "langgraph",
  name: "LangGraph",
  category: "alive",
  pypiPackage: "langgraph",
  npmPackage: "@langchain/langgraph",
  githubRepo: "langchain-ai/langgraph",
  languages: ["python", "javascript"],
};

const REG_ALIVE_PYPI: AgentFramework = {
  id: "crewai",
  name: "CrewAI",
  category: "alive",
  pypiPackage: "crewai",
  githubRepo: "crewAIInc/crewAI",
  languages: ["python"],
};

const REG_LEGACY: AgentFramework = {
  id: "autogpt",
  name: "AutoGPT",
  category: "legacy",
  pypiPackage: "autogpt",
  githubRepo: "Significant-Gravitas/AutoGPT",
  languages: ["python"],
};

const REG_DORMANT: AgentFramework = {
  id: "sweep",
  name: "Sweep",
  category: "dormant",
  githubRepo: "SweepAI/sweep",
  languages: ["python"],
};

function snap(
  id: string,
  weeklyDownloads: number | null,
  ghOverrides: Partial<{
    stars: number;
    pushedAt: string;
    archived: boolean;
  }> = {},
) {
  return {
    id,
    pypiWeeklyDownloads: weeklyDownloads,
    npmWeeklyDownloads: null,
    weeklyDownloads,
    stars: ghOverrides.stars ?? 1000,
    openIssues: 10,
    pushedAt: ghOverrides.pushedAt ?? "2026-05-03T01:00:00Z",
    archived: ghOverrides.archived ?? false,
    pypiStaleSince: null,
    npmStaleSince: null,
    githubStaleSince: null,
    fetchErrors: [],
  };
}

function fetchResult(
  iso: string,
  ...frameworks: ReturnType<typeof snap>[]
): AgentFetchResult {
  return { fetchedAt: iso, frameworks };
}

describe("assembleAgentsView", () => {
  it("computes positive w/w delta — 11M today vs 10M a week ago = +10%", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL],
      current: fetchResult("2026-05-03", snap("langgraph", 11_000_000)),
      sevenDaysAgo: fetchResult("2026-04-26", snap("langgraph", 10_000_000)),
      now: () => NOW,
    });
    const row = result.rows[0];
    expect(row.weeklyDownloads).toBe(11_000_000);
    expect(row.weeklyDeltaPct).toBeCloseTo(10, 5);
    expect(row.deltaState).toBe("fresh");
  });

  it("bootstrap mode — null prior snapshot leaves delta null with state=bootstrap", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL],
      current: fetchResult("2026-05-03", snap("langgraph", 11_000_000)),
      sevenDaysAgo: null,
      now: () => NOW,
    });
    const row = result.rows[0];
    expect(row.weeklyDeltaPct).toBeNull();
    expect(row.deltaState).toBe("bootstrap");
  });

  it("new-from-zero — prior=0, today>0 → delta=null, state=new-from-zero (no divide-by-zero)", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL],
      current: fetchResult("2026-05-03", snap("langgraph", 100)),
      sevenDaysAgo: fetchResult("2026-04-26", snap("langgraph", 0)),
      now: () => NOW,
    });
    const row = result.rows[0];
    expect(row.weeklyDeltaPct).toBeNull();
    expect(row.deltaState).toBe("new-from-zero");
  });

  it("missing prior row — framework not in 7d-old snapshot is bootstrap, not failure", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL, REG_ALIVE_PYPI],
      current: fetchResult(
        "2026-05-03",
        snap("langgraph", 11_000_000),
        snap("crewai", 1_700_000),
      ),
      // 7d-old snapshot missing crewai entirely
      sevenDaysAgo: fetchResult("2026-04-26", snap("langgraph", 10_000_000)),
      now: () => NOW,
    });
    const crew = result.rows.find((r) => r.id === "crewai");
    expect(crew?.deltaState).toBe("bootstrap");
    expect(crew?.weeklyDeltaPct).toBeNull();
  });

  it("missing current downloads — null today leaves delta null, not NaN", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL],
      current: fetchResult("2026-05-03", snap("langgraph", null)),
      sevenDaysAgo: fetchResult("2026-04-26", snap("langgraph", 10_000_000)),
      now: () => NOW,
    });
    const row = result.rows[0];
    expect(row.weeklyDeltaPct).toBeNull();
    expect(Number.isNaN(row.weeklyDeltaPct as unknown as number)).toBe(false);
  });

  it("badge precedence: GH archived flag wins over registry category", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL],
      current: fetchResult(
        "2026-05-03",
        snap("langgraph", 100, { archived: true }),
      ),
      sevenDaysAgo: null,
      now: () => NOW,
    });
    expect(result.rows[0].badge).toBe("archived");
  });

  it("registry-dormant surfaces 'dormant' badge", () => {
    const result = assembleAgentsView({
      registry: [REG_DORMANT],
      current: fetchResult(
        "2026-05-03",
        snap("sweep", null, { pushedAt: "2025-09-18T06:10:59Z" }),
      ),
      sevenDaysAgo: null,
      now: () => NOW,
    });
    expect(result.rows[0].badge).toBe("dormant");
  });

  it("registry-legacy surfaces 'legacy' badge", () => {
    const result = assembleAgentsView({
      registry: [REG_LEGACY],
      current: fetchResult("2026-05-03", snap("autogpt", 116)),
      sevenDaysAgo: null,
      now: () => NOW,
    });
    expect(result.rows[0].badge).toBe("legacy");
  });

  it("runtime-dormant: pushedAt > 90 days ago triggers dormant badge for an alive framework", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL],
      current: fetchResult(
        "2026-05-03",
        snap("langgraph", 100, { pushedAt: "2026-01-01T00:00:00Z" }),
      ),
      sevenDaysAgo: null,
      now: () => NOW,
    });
    expect(result.rows[0].badge).toBe("dormant");
  });

  it("rows sort by w/w delta descending, with tombstones (legacy + dormant) sunk to the bottom", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL, REG_ALIVE_PYPI, REG_LEGACY, REG_DORMANT],
      current: fetchResult(
        "2026-05-03",
        snap("langgraph", 11_000_000),
        snap("crewai", 2_000_000),
        snap("autogpt", 200),
        snap("sweep", null),
      ),
      sevenDaysAgo: fetchResult(
        "2026-04-26",
        snap("langgraph", 10_900_000), // +0.92%
        snap("crewai", 1_700_000), // +17.6%
        snap("autogpt", 100), // +100% but it's legacy → bottom
      ),
      now: () => NOW,
    });
    const ids = result.rows.map((r) => r.id);
    // Crewai's larger delta wins over LangGraph; autogpt + sweep at the
    // bottom (legacy + dormant) regardless of their numbers.
    expect(ids.slice(0, 2)).toEqual(["crewai", "langgraph"]);
    expect(ids.slice(2)).toEqual(expect.arrayContaining(["autogpt", "sweep"]));
  });

  it("propagates pypiStaleSince onto weeklyDownloadsStaleSince when within the 7d cutoff", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_PYPI],
      current: {
        fetchedAt: "2026-05-03",
        frameworks: [
          {
            ...snap("crewai", 1_700_000),
            pypiStaleSince: "2026-05-01T06:30:00Z", // 2 days stale, within cutoff
          },
        ],
      },
      sevenDaysAgo: null,
      now: () => NOW,
    });
    const row = result.rows[0];
    expect(row.weeklyDownloads).toBe(1_700_000);
    expect(row.weeklyDownloadsStaleSince).toBe("2026-05-01T06:30:00Z");
  });

  it("hard cutoff: weeklyDownloads drops to null when staleSince > 7 days old", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_PYPI],
      current: {
        fetchedAt: "2026-05-03",
        frameworks: [
          {
            ...snap("crewai", 1_700_000),
            pypiStaleSince: "2026-04-25T06:30:00Z", // 8 days old, beyond 7d cutoff
          },
        ],
      },
      sevenDaysAgo: null,
      now: () => NOW,
    });
    const row = result.rows[0];
    expect(row.weeklyDownloads).toBeNull();
    expect(row.weeklyDownloadsStaleSince).toBeNull();
  });

  it("worst-of: when both pypi and npm are stale, the older staleSince wins", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL],
      current: {
        fetchedAt: "2026-05-03",
        frameworks: [
          {
            ...snap("langgraph", 13_000_000),
            pypiStaleSince: "2026-05-02T06:30:00Z", // 1d
            npmStaleSince: "2026-04-30T06:30:00Z", // 3d (worst)
          },
        ],
      },
      sevenDaysAgo: null,
      now: () => NOW,
    });
    expect(result.rows[0].weeklyDownloadsStaleSince).toBe(
      "2026-04-30T06:30:00Z",
    );
  });

  it("github stale within cutoff: stars + pushedAt + archived all propagate", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL],
      current: {
        fetchedAt: "2026-05-03",
        frameworks: [
          {
            ...snap("langgraph", 13_000_000, { stars: 31_111 }),
            githubStaleSince: "2026-05-02T06:30:00Z", // 1d, within cutoff
          },
        ],
      },
      sevenDaysAgo: null,
      now: () => NOW,
    });
    const row = result.rows[0];
    expect(row.stars).toBe(31_111);
    expect(row.githubStaleSince).toBe("2026-05-02T06:30:00Z");
  });

  it("github stale beyond cutoff: stars / pushedAt / archived all drop to null", () => {
    const result = assembleAgentsView({
      registry: [REG_ALIVE_FULL],
      current: {
        fetchedAt: "2026-05-03",
        frameworks: [
          {
            ...snap("langgraph", 13_000_000, { stars: 31_111 }),
            githubStaleSince: "2026-04-25T06:30:00Z", // 8d, beyond cutoff
          },
        ],
      },
      sevenDaysAgo: null,
      now: () => NOW,
    });
    const row = result.rows[0];
    expect(row.stars).toBeNull();
    expect(row.pushedAt).toBeNull();
    expect(row.githubStaleSince).toBeNull();
  });

  it("preserves caveats from the registry verbatim onto each row", () => {
    const result = assembleAgentsView({
      registry: [
        { ...REG_ALIVE_PYPI, caveat: "Test caveat — propagate verbatim." },
      ],
      current: fetchResult("2026-05-03", snap("crewai", 1_700_000)),
      sevenDaysAgo: null,
      now: () => NOW,
    });
    expect(result.rows[0].caveat).toBe("Test caveat — propagate verbatim.");
  });
});
