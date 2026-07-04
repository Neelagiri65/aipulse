import { describe, expect, it } from "vitest";

import type { GitHubEvent } from "@/lib/github";

import {
  fetchTrackedRepoEvents,
  trackedRepoList,
} from "@/lib/data/tracked-repos";

function event(id: string, repo: string): GitHubEvent {
  return {
    id,
    type: "PushEvent",
    actor: { id: 1, login: "Neelagiri65", avatar_url: "", url: "" },
    repo: { id: 1, name: repo, url: "" },
    created_at: "2026-07-04T12:00:00Z",
  } as unknown as GitHubEvent;
}

describe("trackedRepoList", () => {
  it("loads the committed curated list (14 repos, all owner-qualified)", () => {
    const repos = trackedRepoList();
    expect(repos).toHaveLength(14);
    for (const r of repos) expect(r).toMatch(/^[\w.-]+\/[\w.-]+$/);
    expect(repos).toContain("Neelagiri65/aipulse");
  });
});

describe("fetchTrackedRepoEvents", () => {
  it("merges events across repos", async () => {
    const result = await fetchTrackedRepoEvents(
      async (name) => [event(`${name}-1`, name), event(`${name}-2`, name)],
      ["a/one", "b/two"],
    );
    expect(result.events).toHaveLength(4);
    expect(result.failures).toEqual([]);
  });

  it("isolates per-repo failures: one 404 never drops the other repos' events", async () => {
    const result = await fetchTrackedRepoEvents(async (name) => {
      if (name === "a/renamed") throw new Error("repo events a/renamed returned 404");
      return [event(`${name}-1`, name)];
    }, ["a/renamed", "b/alive", "c/alive"]);
    expect(result.events.map((e) => e.repo.name)).toEqual(["b/alive", "c/alive"]);
    expect(result.failures).toEqual([
      { step: "tracked:a/renamed", message: "repo events a/renamed returned 404" },
    ]);
  });

  it("empty list is a no-op (no fetches, no failures)", async () => {
    let calls = 0;
    const result = await fetchTrackedRepoEvents(async () => {
      calls += 1;
      return [];
    }, []);
    expect(calls).toBe(0);
    expect(result.events).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it("all repos failing yields zero events and one failure per repo (token-death shape)", async () => {
    const result = await fetchTrackedRepoEvents(async (name) => {
      throw new Error(`repo events ${name} returned 401`);
    }, ["a/x", "b/y"]);
    expect(result.events).toEqual([]);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0].step).toBe("tracked:a/x");
  });
});
