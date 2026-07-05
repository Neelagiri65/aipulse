import { describe, expect, it } from "vitest";

import { assembleAgentsView } from "@/lib/data/agents-view";
import type { AgentFramework } from "@/lib/data/agents-registry";
import type { AgentFetchResult } from "@/lib/data/agents-fetch";
import { auditItem, checkDeltaProvenance } from "@/lib/trust/invariants";

/**
 * OUTPUT-LEVEL trust framing for the agents feed. Behaviour is covered in
 * agents-view.test.ts; this asserts the SAME cases through the shared
 * delta-provenance invariant so the gap table can mark agents ✓D honestly
 * and a regression trips the harness, not just a local test. Invariant: a
 * weekly-% movement is only asserted when a real prior week existed.
 */

const NOW = new Date("2026-05-03T07:00:00Z");

const REG: AgentFramework = {
  id: "langgraph",
  name: "LangGraph",
  category: "alive",
  pypiPackage: "langgraph",
  npmPackage: "@langchain/langgraph",
  githubRepo: "langchain-ai/langgraph",
  languages: ["python", "javascript"],
};

function snap(id: string, weeklyDownloads: number | null) {
  return {
    id,
    pypiWeeklyDownloads: weeklyDownloads,
    npmWeeklyDownloads: null,
    weeklyDownloads,
    stars: 1000,
    openIssues: 10,
    pushedAt: "2026-05-03T01:00:00Z",
    archived: false,
    pypiStaleSince: null,
    npmStaleSince: null,
    githubStaleSince: null,
    fetchErrors: [],
  };
}

function fetchResult(iso: string, ...frameworks: ReturnType<typeof snap>[]): AgentFetchResult {
  return { fetchedAt: iso, frameworks } as unknown as AgentFetchResult;
}

function movementClaimed(deltaPct: number | null): boolean {
  return deltaPct !== null;
}

describe("agents — weekly delta only against a real prior week", () => {
  it("bootstrap (no prior snapshot): no movement claim", () => {
    const view = assembleAgentsView({
      registry: [REG],
      current: fetchResult("2026-05-03T07:00:00Z", snap("langgraph", 11_000_000)),
      sevenDaysAgo: null,
      now: () => NOW,
    });
    const row = view.rows.find((r) => r.id === "langgraph")!;
    expect(row.weeklyDeltaPct).toBeNull();
    expect(auditItem([checkDeltaProvenance(movementClaimed(row.weeklyDeltaPct), false)])).toEqual([]);
  });

  it("new-from-zero (prior=0): no fabricated % (no divide-by-zero)", () => {
    const view = assembleAgentsView({
      registry: [REG],
      current: fetchResult("2026-05-03T07:00:00Z", snap("langgraph", 100)),
      sevenDaysAgo: fetchResult("2026-04-26T07:00:00Z", snap("langgraph", 0)),
      now: () => NOW,
    });
    const row = view.rows.find((r) => r.id === "langgraph")!;
    expect(row.weeklyDeltaPct).toBeNull();
    expect(row.deltaState).toBe("new-from-zero");
  });

  it("a real prior week produces a movement WITH provenance", () => {
    const view = assembleAgentsView({
      registry: [REG],
      current: fetchResult("2026-05-03T07:00:00Z", snap("langgraph", 11_000_000)),
      sevenDaysAgo: fetchResult("2026-04-26T07:00:00Z", snap("langgraph", 10_000_000)),
      now: () => NOW,
    });
    const row = view.rows.find((r) => r.id === "langgraph")!;
    expect(row.weeklyDeltaPct).toBeCloseTo(10, 5);
    expect(auditItem([checkDeltaProvenance(movementClaimed(row.weeklyDeltaPct), true)])).toEqual([]);
  });
});
