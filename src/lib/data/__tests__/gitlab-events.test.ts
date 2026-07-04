import { describe, expect, it } from "vitest";

import {
  fetchGitLabEvents,
  isPulseNoise,
  mapGitLabAction,
  toGitHubShape,
  type GitLabRawEvent,
  type GitLabSourcesConfig,
} from "@/lib/data/gitlab-events";

const NOW = "2026-07-05T00:00:00.000Z";

function raw(overrides: Partial<GitLabRawEvent> = {}): GitLabRawEvent {
  return {
    id: 12345,
    action_name: "pushed to",
    target_type: null,
    author: { username: "alice" },
    created_at: NOW,
    ...overrides,
  };
}

function cfg(overrides: Partial<GitLabSourcesConfig> = {}): GitLabSourcesConfig {
  return {
    pulse: { enabled: false, pages: 1, sampleProjects: 12 },
    projects: [],
    ...overrides,
  };
}

describe("mapGitLabAction — truth table (unknown = null, never coerced)", () => {
  it("maps the supported vocabulary", () => {
    expect(mapGitLabAction("pushed to", null)).toBe("PushEvent");
    expect(mapGitLabAction("pushed new", null)).toBe("PushEvent");
    expect(mapGitLabAction("opened", "MergeRequest")).toBe("PullRequestEvent");
    expect(mapGitLabAction("accepted", "MergeRequest")).toBe("PullRequestEvent");
    expect(mapGitLabAction("opened", "Issue")).toBe("IssuesEvent");
    expect(mapGitLabAction("commented on", "Note")).toBe("IssueCommentEvent");
    expect(mapGitLabAction("created", null)).toBe("CreateEvent");
  });

  it("returns null for everything else — joined/left/deleted/unknown", () => {
    for (const a of ["joined", "left", "deleted", "destroyed", "imported", "??"]) {
      expect(mapGitLabAction(a, null)).toBeNull();
    }
    // opened with an unknown target is NOT guessed into a type.
    expect(mapGitLabAction("opened", "Milestone")).toBeNull();
  });
});

describe("toGitHubShape — namespacing (the cross-pipeline safety core)", () => {
  it("namespaces id (gl:), login (gl:), and repo (gitlab.com/)", () => {
    const e = toGitHubShape(raw(), "inkscape/inkscape")!;
    expect(e.id).toBe("gl:12345");
    expect(e.actor.login).toBe("gl:alice");
    expect(e.repo.name).toBe("gitlab.com/inkscape/inkscape");
    expect(e.type).toBe("PushEvent");
  });

  it("a GitLab id can never collide with a GitHub numeric id", () => {
    const gh = "12345"; // GitHub event ids are bare numerics
    const gl = toGitHubShape(raw({ id: 12345 }), "x/y")!.id;
    expect(gl).not.toBe(gh);
  });

  it("drops unmapped actions and authorless events", () => {
    expect(toGitHubShape(raw({ action_name: "joined" }), "x/y")).toBeNull();
    expect(toGitHubShape(raw({ author: undefined }), "x/y")).toBeNull();
  });
});

describe("isPulseNoise — mechanical filters", () => {
  it("skips mirror namespaces (GitHub double-count hazard)", () => {
    expect(isPulseNoise("freedesktop-sdk/mirrors/github/libsdl-org/SDL_mixer")).toBe(true);
  });
  it("skips deletion-scheduled churn", () => {
    expect(isPulseNoise("rachel.green.r/ecoscan-1253412-deletion_scheduled-84106730")).toBe(true);
  });
  it("keeps real projects", () => {
    expect(isPulseNoise("gitlab-org/gitlab")).toBe(false);
    expect(isPulseNoise("inkscape/inkscape")).toBe(false);
  });
});

describe("fetchGitLabEvents", () => {
  it("INERT config = zero fetches (the PR-A no-op guarantee)", async () => {
    let calls = 0;
    const result = await fetchGitLabEvents(cfg(), async () => {
      calls += 1;
      return [];
    });
    expect(calls).toBe(0);
    expect(result.events).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it("tracked mode: maps events; geo resolves via GITLAB users API only WHEN a token is present", async () => {
    process.env.GITLAB_TOKEN = "test-token";
    const urls: string[] = [];
    const result = await fetchGitLabEvents(
      cfg({ projects: ["gitlab-org/gitlab"] }),
      async (url) => {
        urls.push(url);
        if (url.includes("/events")) return [raw(), raw({ id: 2, action_name: "joined" })];
        if (url.includes("/users?username=")) return [{ id: 77 }];
        if (url.endsWith("/users/77")) return { location: "London" };
        return [];
      },
    );
    delete process.env.GITLAB_TOKEN;
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe("gl:12345");
    expect(result.droppedActions).toEqual({ joined: 1 });
    expect(result.locationSeeds.get("gl:alice")).toEqual(expect.any(Array));
    expect(urls.every((u) => u.startsWith("https://gitlab.com/"))).toBe(true);
  });

  it("NO token: events still ingest, but geo lookups are SKIPPED (no 403 noise)", async () => {
    delete process.env.GITLAB_TOKEN;
    const urls: string[] = [];
    const result = await fetchGitLabEvents(
      cfg({ projects: ["gitlab-org/gitlab"] }),
      async (url) => {
        urls.push(url);
        if (url.includes("/events")) return [raw()];
        return [];
      },
    );
    expect(result.events).toHaveLength(1); // events flow
    expect(result.locationSeeds.size).toBe(0); // no geo attempted
    expect(urls.some((u) => u.includes("/users"))).toBe(false); // no user calls
    expect(result.failures).toEqual([]); // no 403 spam
  });

  it("per-project failures are isolated; the result never throws", async () => {
    const result = await fetchGitLabEvents(
      cfg({ projects: ["a/dead", "b/alive"] }),
      async (url) => {
        if (url.includes("a%2Fdead")) throw new Error("gitlab 404");
        if (url.includes("/events")) return [raw({ author: { username: "bob" } })];
        if (url.includes("/users?username=")) return [];
        return [];
      },
    );
    expect(result.events).toHaveLength(1);
    expect(result.failures.some((f) => f.step === "gitlab:a/dead")).toBe(true);
  });

  it("total failure yields empty events + failures only (token-death shape)", async () => {
    const result = await fetchGitLabEvents(
      cfg({ projects: ["a/x", "b/y"] }),
      async () => {
        throw new Error("gitlab 503");
      },
    );
    expect(result.events).toEqual([]);
    expect(result.failures).toHaveLength(2);
  });

  it("pulse mode: samples fresh projects, applies noise filters", async () => {
    const result = await fetchGitLabEvents(
      cfg({ pulse: { enabled: true, pages: 1, sampleProjects: 2 } }),
      async (url) => {
        if (url.includes("order_by=last_activity_at")) {
          return [
            { path_with_namespace: "freedesktop-sdk/mirrors/github/x/y" },
            { path_with_namespace: "real/project-one" },
            { path_with_namespace: "spam/x-deletion_scheduled-1" },
            { path_with_namespace: "real/project-two" },
            { path_with_namespace: "real/project-three" },
          ];
        }
        if (url.includes("/events")) return [raw()];
        if (url.includes("/users?username=")) return [];
        return [];
      },
    );
    // 2 sampled (noise filtered, cap respected) -> 2 events.
    expect(result.events).toHaveLength(2);
    const repos = result.events.map((e) => e.repo.name).sort();
    expect(repos).toEqual([
      "gitlab.com/real/project-one",
      "gitlab.com/real/project-two",
    ]);
  });
});
