/**
 * Agents-fetch orchestrator: per-framework fan-out to PyPI + npm + GH,
 * partial-failure isolation, no I/O outside the injected fetchImpl.
 *
 * Verifies the contract the ingest route + view assembler depend on:
 *   1. PyPI / npm fetch only when the registry entry has a package name
 *   2. GitHub meta fetch always (even tombstones — the dormant flag
 *      derives from a real GH archived/pushed_at value)
 *   3. One fetch failure does not poison the framework's other fetches
 *   4. One framework's failures do not poison other frameworks
 *   5. Numeric coercion is tight — non-numeric fields surface as null
 *      with a fetchError, never a NaN that propagates downstream
 */

import { describe, it, expect, vi } from "vitest";
import {
  fetchAgentSnapshots,
  type AgentFetchOptions,
} from "@/lib/data/agents-fetch";
import type { AgentFramework } from "@/lib/data/agents-registry";

const NOW = new Date("2026-05-03T06:30:00Z");

const FW_FULL: AgentFramework = {
  id: "langgraph",
  name: "LangGraph",
  category: "alive",
  pypiPackage: "langgraph",
  npmPackage: "@langchain/langgraph",
  githubRepo: "langchain-ai/langgraph",
  languages: ["python", "javascript"],
};

const FW_PYPI_ONLY: AgentFramework = {
  id: "crewai",
  name: "CrewAI",
  category: "alive",
  pypiPackage: "crewai",
  githubRepo: "crewAIInc/crewAI",
  languages: ["python"],
};

const FW_GH_ONLY: AgentFramework = {
  id: "sweep",
  name: "Sweep",
  category: "dormant",
  githubRepo: "SweepAI/sweep",
  languages: ["python"],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

function buildHandler(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, fn] of Object.entries(routes)) {
      if (url.includes(pattern)) return fn();
    }
    throw new Error(`Unmocked URL in test: ${url}`);
  });
}

const baseOpts = (fetchImpl: typeof fetch): AgentFetchOptions => ({
  fetchImpl,
  now: () => NOW,
  ghToken: "test-token",
  // Skip the inter-framework throttle in unit tests so the suite
  // doesn't pay 250ms per fixture × 8 frameworks. Production keeps
  // the default 250ms to stay under pypistats' 429 threshold.
  perFrameworkDelayMs: 0,
});

describe("fetchAgentSnapshots", () => {
  it("populates pypi + npm + github fields for a multi-language framework", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org/api/packages/langgraph/recent": () =>
        jsonResponse({ data: { last_day: 1, last_week: 11_000_000, last_month: 45_000_000 } }),
      "api.npmjs.org/downloads/point/last-week/@langchain/langgraph": () =>
        jsonResponse({ downloads: 2_000_000, package: "@langchain/langgraph" }),
      "api.github.com/repos/langchain-ai/langgraph": () =>
        jsonResponse({
          stargazers_count: 31_111,
          open_issues_count: 516,
          pushed_at: "2026-05-03T01:05:11Z",
          archived: false,
        }),
    });

    const result = await fetchAgentSnapshots([FW_FULL], baseOpts(fetchImpl));

    expect(result.fetchedAt).toBe(NOW.toISOString());
    expect(result.frameworks).toHaveLength(1);
    const fw = result.frameworks[0];
    expect(fw.id).toBe("langgraph");
    expect(fw.pypiWeeklyDownloads).toBe(11_000_000);
    expect(fw.npmWeeklyDownloads).toBe(2_000_000);
    expect(fw.weeklyDownloads).toBe(13_000_000);
    expect(fw.stars).toBe(31_111);
    expect(fw.openIssues).toBe(516);
    expect(fw.pushedAt).toBe("2026-05-03T01:05:11Z");
    expect(fw.archived).toBe(false);
    expect(fw.fetchErrors).toEqual([]);
  });

  it("skips npm fetch for python-only frameworks", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org/api/packages/crewai/recent": () =>
        jsonResponse({ data: { last_day: 1, last_week: 1_762_851, last_month: 7_000_000 } }),
      "api.github.com/repos/crewAIInc/crewAI": () =>
        jsonResponse({
          stargazers_count: 50_534,
          open_issues_count: 367,
          pushed_at: "2026-05-03T16:10:59Z",
          archived: false,
        }),
    });

    const result = await fetchAgentSnapshots([FW_PYPI_ONLY], baseOpts(fetchImpl));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const fw = result.frameworks[0];
    expect(fw.pypiWeeklyDownloads).toBe(1_762_851);
    expect(fw.npmWeeklyDownloads).toBeNull();
    expect(fw.weeklyDownloads).toBe(1_762_851);
  });

  it("for GH-only tombstones, skips all package fetches and surfaces archived/pushedAt verbatim", async () => {
    const fetchImpl = buildHandler({
      "api.github.com/repos/SweepAI/sweep": () =>
        jsonResponse({
          stargazers_count: 7_712,
          open_issues_count: 749,
          pushed_at: "2025-09-18T06:10:59Z",
          archived: false,
        }),
    });

    const result = await fetchAgentSnapshots([FW_GH_ONLY], baseOpts(fetchImpl));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const fw = result.frameworks[0];
    expect(fw.pypiWeeklyDownloads).toBeNull();
    expect(fw.npmWeeklyDownloads).toBeNull();
    expect(fw.weeklyDownloads).toBeNull();
    expect(fw.pushedAt).toBe("2025-09-18T06:10:59Z");
    expect(fw.archived).toBe(false);
  });

  it("isolates per-source failure within a framework — pypi 500 leaves npm + github populated", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org/api/packages/langgraph/recent": () =>
        textResponse("upstream error", 500),
      "api.npmjs.org/downloads/point/last-week/@langchain/langgraph": () =>
        jsonResponse({ downloads: 2_000_000, package: "@langchain/langgraph" }),
      "api.github.com/repos/langchain-ai/langgraph": () =>
        jsonResponse({
          stargazers_count: 31_111,
          open_issues_count: 516,
          pushed_at: "2026-05-03T01:05:11Z",
          archived: false,
        }),
    });

    const result = await fetchAgentSnapshots([FW_FULL], baseOpts(fetchImpl));

    const fw = result.frameworks[0];
    expect(fw.pypiWeeklyDownloads).toBeNull();
    expect(fw.npmWeeklyDownloads).toBe(2_000_000);
    expect(fw.stars).toBe(31_111);
    expect(fw.weeklyDownloads).toBe(2_000_000);
    expect(fw.fetchErrors).toHaveLength(1);
    expect(fw.fetchErrors[0]).toEqual({
      source: "pypi",
      message: expect.stringContaining("500"),
    });
  });

  it("isolates per-framework failure — one framework's GH 404 leaves others intact", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org/api/packages/crewai/recent": () =>
        jsonResponse({ data: { last_day: 1, last_week: 1_762_851, last_month: 7_000_000 } }),
      "api.github.com/repos/crewAIInc/crewAI": () =>
        jsonResponse({
          stargazers_count: 50_534,
          open_issues_count: 367,
          pushed_at: "2026-05-03T16:10:59Z",
          archived: false,
        }),
      "api.github.com/repos/SweepAI/sweep": () => textResponse("not found", 404),
    });

    const result = await fetchAgentSnapshots(
      [FW_PYPI_ONLY, FW_GH_ONLY],
      baseOpts(fetchImpl),
    );

    const crew = result.frameworks.find((f) => f.id === "crewai");
    const sweep = result.frameworks.find((f) => f.id === "sweep");
    expect(crew?.stars).toBe(50_534);
    expect(crew?.fetchErrors).toEqual([]);
    expect(sweep?.stars).toBeNull();
    expect(sweep?.archived).toBeNull();
    expect(sweep?.fetchErrors).toHaveLength(1);
    expect(sweep?.fetchErrors[0].source).toBe("github");
  });

  it("when both pypi and npm fail, weeklyDownloads is null (never 0 by silent coercion)", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org/api/packages/langgraph/recent": () =>
        textResponse("err", 500),
      "api.npmjs.org/downloads/point/last-week/@langchain/langgraph": () =>
        textResponse("err", 500),
      "api.github.com/repos/langchain-ai/langgraph": () =>
        jsonResponse({
          stargazers_count: 31_111,
          open_issues_count: 516,
          pushed_at: "2026-05-03T01:05:11Z",
          archived: false,
        }),
    });

    const result = await fetchAgentSnapshots([FW_FULL], baseOpts(fetchImpl));
    const fw = result.frameworks[0];
    expect(fw.weeklyDownloads).toBeNull();
    expect(fw.fetchErrors).toHaveLength(2);
  });

  it("rejects non-numeric counters with a fetchError — never propagates NaN", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org/api/packages/crewai/recent": () =>
        jsonResponse({ data: { last_day: "?", last_week: "garbage", last_month: 7_000_000 } }),
      "api.github.com/repos/crewAIInc/crewAI": () =>
        jsonResponse({
          stargazers_count: 50_534,
          open_issues_count: 367,
          pushed_at: "2026-05-03T16:10:59Z",
          archived: false,
        }),
    });

    const result = await fetchAgentSnapshots([FW_PYPI_ONLY], baseOpts(fetchImpl));
    const fw = result.frameworks[0];
    expect(fw.pypiWeeklyDownloads).toBeNull();
    expect(fw.weeklyDownloads).toBeNull();
    expect(fw.fetchErrors).toHaveLength(1);
    expect(fw.fetchErrors[0].source).toBe("pypi");
  });

  it("sends the GitHub auth header when ghToken is provided", async () => {
    const fetchImpl = buildHandler({
      "api.github.com/repos/SweepAI/sweep": () =>
        jsonResponse({
          stargazers_count: 7_712,
          open_issues_count: 749,
          pushed_at: "2025-09-18T06:10:59Z",
          archived: false,
        }),
    });
    await fetchAgentSnapshots([FW_GH_ONLY], baseOpts(fetchImpl));
    const call = fetchImpl.mock.calls[0];
    const init = call[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer test-token");
  });

  it("throttles between frameworks via the injected sleep — N-1 calls for N frameworks", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org": () =>
        jsonResponse({ data: { last_day: 1, last_week: 100, last_month: 1000 } }),
      "api.github.com": () =>
        jsonResponse({
          stargazers_count: 10,
          open_issues_count: 1,
          pushed_at: "2026-05-01T00:00:00Z",
          archived: false,
        }),
    });
    const sleep = vi.fn(async () => {});
    await fetchAgentSnapshots([FW_PYPI_ONLY, FW_PYPI_ONLY, FW_PYPI_ONLY], {
      fetchImpl,
      now: () => NOW,
      perFrameworkDelayMs: 250,
      sleep,
    });
    // 3 frameworks → 2 inter-framework sleeps.
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("does not sleep when perFrameworkDelayMs is 0", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org": () =>
        jsonResponse({ data: { last_day: 1, last_week: 100, last_month: 1000 } }),
      "api.github.com": () =>
        jsonResponse({
          stargazers_count: 10,
          open_issues_count: 1,
          pushed_at: "2026-05-01T00:00:00Z",
          archived: false,
        }),
    });
    const sleep = vi.fn(async () => {});
    await fetchAgentSnapshots([FW_PYPI_ONLY, FW_PYPI_ONLY], {
      fetchImpl,
      now: () => NOW,
      perFrameworkDelayMs: 0,
      sleep,
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("preserves framework order from input", async () => {
    const fetchImpl = buildHandler({
      "pypistats.org": () =>
        jsonResponse({ data: { last_day: 1, last_week: 100, last_month: 1000 } }),
      "api.npmjs.org": () => jsonResponse({ downloads: 50, package: "x" }),
      "api.github.com": () =>
        jsonResponse({
          stargazers_count: 10,
          open_issues_count: 1,
          pushed_at: "2026-05-01T00:00:00Z",
          archived: false,
        }),
    });
    const result = await fetchAgentSnapshots(
      [FW_PYPI_ONLY, FW_FULL, FW_GH_ONLY],
      baseOpts(fetchImpl),
    );
    expect(result.frameworks.map((f) => f.id)).toEqual([
      "crewai",
      "langgraph",
      "sweep",
    ]);
  });
});
