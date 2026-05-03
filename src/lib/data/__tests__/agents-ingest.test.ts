/**
 * Agents-ingest orchestrator: registry + fetcher + store-write composition.
 *
 * The Redis writes are injected as spies so the test asserts the contract
 * (today's date for the snapshot key, ok:true means at least one row had
 * any usable field, ok:false leaves prior blobs untouched).
 */

import { describe, it, expect, vi } from "vitest";
import { runAgentsIngest } from "@/lib/data/agents-ingest";
import type { AgentFramework } from "@/lib/data/agents-registry";

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
});
