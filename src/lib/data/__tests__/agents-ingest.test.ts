/**
 * Agents-ingest orchestrator: registry + fetcher + store-write composition.
 *
 * The Redis writes are injected as spies so the test asserts the contract
 * (today's date for the snapshot key, ok:true means at least one row had
 * any usable field, ok:false leaves prior blobs untouched).
 */

import { describe, it, expect, vi } from "vitest";
import {
  runAgentsIngest,
  mergeWithPriorSnapshot,
} from "@/lib/data/agents-ingest";
import type { AgentFramework } from "@/lib/data/agents-registry";
import type { AgentFrameworkSnapshot } from "@/lib/data/agents-fetch";

const NOW = new Date("2026-05-03T06:30:00Z");

const TINY_REGISTRY: readonly AgentFramework[] = [
  {
    id: "crewai",
    name: "CrewAI",
    category: "alive",
    pypiPackage: "crewai",
    githubRepo: "crewAIInc/crewAI",
    languages: ["python"],
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildHandler(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, fn] of Object.entries(routes)) {
      if (url.includes(pattern)) return fn();
    }
    throw new Error(`Unmocked URL: ${url}`);
  });
}

describe("runAgentsIngest", () => {
  it("writes both latest and dated snapshot when at least one framework succeeds", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org/api/packages/crewai/recent": () =>
        jsonResponse({
          data: { last_day: 1, last_week: 1_762_851, last_month: 7_000_000 },
        }),
      "api.github.com/repos/crewAIInc/crewAI": () =>
        jsonResponse({
          stargazers_count: 50_534,
          open_issues_count: 367,
          pushed_at: "2026-05-03T16:10:59Z",
          archived: false,
        }),
    });
    const writeLatest = vi.fn(async () => {});
    const writeSnapshot = vi.fn(async () => {});

    const result = await runAgentsIngest({
      fetchImpl,
      now: () => NOW,
      registry: TINY_REGISTRY,
      writeLatest,
      writeSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.snapshotDate).toBe("2026-05-03");
    expect(writeLatest).toHaveBeenCalledTimes(1);
    expect(writeSnapshot).toHaveBeenCalledTimes(1);
    const [date, blob] = writeSnapshot.mock.calls[0];
    expect(date).toBe("2026-05-03");
    expect(blob.frameworks[0].id).toBe("crewai");
    expect(blob.frameworks[0].weeklyDownloads).toBe(1_762_851);
  });

  it("ok:false when every fetch fails — neither blob is written", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org": () => new Response("err", { status: 500 }),
      "api.github.com": () => new Response("err", { status: 500 }),
    });
    const writeLatest = vi.fn(async () => {});
    const writeSnapshot = vi.fn(async () => {});

    const result = await runAgentsIngest({
      fetchImpl,
      now: () => NOW,
      registry: TINY_REGISTRY,
      writeLatest,
      writeSnapshot,
    });

    expect(result.ok).toBe(false);
    expect(result.succeeded).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].id).toBe("crewai");
    expect(result.failures[0].sources).toEqual(
      expect.arrayContaining(["pypi", "github"]),
    );
    expect(writeLatest).not.toHaveBeenCalled();
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it("ok:true when only github succeeds — partial data is still useful for the panel", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org": () => new Response("err", { status: 500 }),
      "api.github.com/repos/crewAIInc/crewAI": () =>
        jsonResponse({
          stargazers_count: 50_534,
          open_issues_count: 367,
          pushed_at: "2026-05-03T16:10:59Z",
          archived: false,
        }),
    });
    const writeLatest = vi.fn(async () => {});
    const writeSnapshot = vi.fn(async () => {});

    const result = await runAgentsIngest({
      fetchImpl,
      now: () => NOW,
      registry: TINY_REGISTRY,
      writeLatest,
      writeSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(writeLatest).toHaveBeenCalled();
    expect(writeSnapshot).toHaveBeenCalled();
  });

  it("merges prior values when current pypi fetch fails AND prior exists — last-known-good", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org": () => new Response("rate-limit", { status: 429 }),
      "api.github.com/repos/crewAIInc/crewAI": () =>
        jsonResponse({
          stargazers_count: 50_534,
          open_issues_count: 367,
          pushed_at: "2026-05-03T16:10:59Z",
          archived: false,
        }),
    });
    const priorSnapshot = makeSnapshot({
      id: "crewai",
      pypiWeeklyDownloads: 1_700_000,
    });
    const readPriorLatest = vi.fn(async () => ({
      fetchedAt: "2026-05-02T06:30:00Z",
      frameworks: [priorSnapshot],
    }));
    const writeLatest = vi.fn(async () => {});
    const writeSnapshot = vi.fn(async () => {});

    await runAgentsIngest({
      fetchImpl,
      now: () => NOW,
      registry: TINY_REGISTRY,
      readPriorLatest,
      writeLatest,
      writeSnapshot,
    });

    const written = writeLatest.mock.calls[0][0] as {
      frameworks: AgentFrameworkSnapshot[];
    };
    const crew = written.frameworks[0];
    // Carried forward from prior — not the current null.
    expect(crew.pypiWeeklyDownloads).toBe(1_700_000);
    expect(crew.weeklyDownloads).toBe(1_700_000);
    // staleSince stamped to THIS run's ISO since prior had no staleSince
    // (this is the first stale run for that source).
    expect(crew.pypiStaleSince).toBe(NOW.toISOString());
  });
});

describe("mergeWithPriorSnapshot", () => {
  const RUN_ISO = "2026-05-03T06:30:00Z";

  it("fresh fetch passes through unchanged — no carry-forward needed", () => {
    const cur = makeSnapshot({
      id: "lg",
      pypiWeeklyDownloads: 1000,
      stars: 100,
    });
    const prior = makeSnapshot({
      id: "lg",
      pypiWeeklyDownloads: 999,
      stars: 99,
    });
    const merged = mergeWithPriorSnapshot(cur, prior, RUN_ISO);
    expect(merged.pypiWeeklyDownloads).toBe(1000);
    expect(merged.pypiStaleSince).toBeNull();
    expect(merged.stars).toBe(100);
    expect(merged.githubStaleSince).toBeNull();
  });

  it("pypi fetch failed, prior exists → carry forward + stamp staleSince=runIso", () => {
    const cur = makeSnapshot({
      id: "lg",
      pypiWeeklyDownloads: null,
      fetchErrors: [{ source: "pypi", message: "429" }],
    });
    const prior = makeSnapshot({
      id: "lg",
      pypiWeeklyDownloads: 9_600_000,
    });
    const merged = mergeWithPriorSnapshot(cur, prior, RUN_ISO);
    expect(merged.pypiWeeklyDownloads).toBe(9_600_000);
    expect(merged.pypiStaleSince).toBe(RUN_ISO);
    expect(merged.weeklyDownloads).toBe(9_600_000);
  });

  it("pypi fetch failed, prior was already stale → preserve older staleSince (compounds honestly)", () => {
    const cur = makeSnapshot({
      id: "lg",
      pypiWeeklyDownloads: null,
      fetchErrors: [{ source: "pypi", message: "429" }],
    });
    const prior = makeSnapshot({
      id: "lg",
      pypiWeeklyDownloads: 9_600_000,
      pypiStaleSince: "2026-05-01T06:30:00Z",
    });
    const merged = mergeWithPriorSnapshot(cur, prior, RUN_ISO);
    expect(merged.pypiStaleSince).toBe("2026-05-01T06:30:00Z");
  });

  it("pypi fetch failed, no prior → stays null (true cold-start gap)", () => {
    const cur = makeSnapshot({
      id: "lg",
      pypiWeeklyDownloads: null,
      fetchErrors: [{ source: "pypi", message: "429" }],
    });
    const merged = mergeWithPriorSnapshot(cur, null, RUN_ISO);
    expect(merged.pypiWeeklyDownloads).toBeNull();
    expect(merged.pypiStaleSince).toBeNull();
  });

  it("github fetch failed, prior exists → restores stars + pushedAt + archived as a unit", () => {
    const cur = makeSnapshot({
      id: "lg",
      stars: null,
      openIssues: null,
      pushedAt: null,
      archived: null,
      fetchErrors: [{ source: "github", message: "500" }],
    });
    const prior = makeSnapshot({
      id: "lg",
      stars: 31_111,
      openIssues: 516,
      pushedAt: "2026-05-02T01:00:00Z",
      archived: false,
    });
    const merged = mergeWithPriorSnapshot(cur, prior, RUN_ISO);
    expect(merged.stars).toBe(31_111);
    expect(merged.openIssues).toBe(516);
    expect(merged.pushedAt).toBe("2026-05-02T01:00:00Z");
    expect(merged.archived).toBe(false);
    expect(merged.githubStaleSince).toBe(RUN_ISO);
  });

  it("recomputes weeklyDownloads from merged per-source values", () => {
    const cur = makeSnapshot({
      id: "lg",
      pypiWeeklyDownloads: null,
      npmWeeklyDownloads: 2_000_000,
      fetchErrors: [{ source: "pypi", message: "429" }],
    });
    const prior = makeSnapshot({
      id: "lg",
      pypiWeeklyDownloads: 11_000_000,
      npmWeeklyDownloads: 1_900_000,
    });
    const merged = mergeWithPriorSnapshot(cur, prior, RUN_ISO);
    // pypi carried forward (11M), npm fresh (2M) → sum is 13M.
    expect(merged.weeklyDownloads).toBe(13_000_000);
  });
});

function makeSnapshot(
  overrides: Partial<AgentFrameworkSnapshot> & { id: string },
): AgentFrameworkSnapshot {
  return {
    id: overrides.id,
    pypiWeeklyDownloads: overrides.pypiWeeklyDownloads ?? null,
    npmWeeklyDownloads: overrides.npmWeeklyDownloads ?? null,
    weeklyDownloads:
      overrides.weeklyDownloads !== undefined
        ? overrides.weeklyDownloads
        : (overrides.pypiWeeklyDownloads ?? 0) +
          (overrides.npmWeeklyDownloads ?? 0) || null,
    stars: overrides.stars ?? null,
    openIssues: overrides.openIssues ?? null,
    pushedAt: overrides.pushedAt ?? null,
    archived: overrides.archived ?? null,
    pypiStaleSince: overrides.pypiStaleSince ?? null,
    npmStaleSince: overrides.npmStaleSince ?? null,
    githubStaleSince: overrides.githubStaleSince ?? null,
    fetchErrors: overrides.fetchErrors ?? [],
  };
}
