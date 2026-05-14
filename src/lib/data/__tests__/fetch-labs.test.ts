import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { LabEntry } from "@/lib/data/labs-registry";
import {
  fetchLabActivity,
  LABS_RELEVANT_TYPES,
  WINDOW_MS,
  type LabsFetchOptions,
} from "@/lib/data/fetch-labs";

const FIXED_NOW = new Date("2026-04-20T12:00:00Z");

const labA: LabEntry = {
  id: "lab-a",
  displayName: "Lab A",
  kind: "labs",
  city: "Testville",
  country: "US",
  lat: 37.77,
  lng: -122.42,
  hqSourceUrl: "https://example.com/a",
  url: "https://example.com/a",
  orgs: ["lab-a"],
  repos: [
    { owner: "lab-a", repo: "flagship", sourceUrl: "https://github.com/lab-a/flagship" },
    { owner: "lab-a", repo: "other", sourceUrl: "https://github.com/lab-a/other" },
  ],
};

const labB: LabEntry = {
  id: "lab-b",
  displayName: "Lab B",
  kind: "labs",
  city: "Cambridge",
  country: "GB",
  lat: 52.2,
  lng: 0.12,
  hqSourceUrl: "https://example.com/b",
  url: "https://example.com/b",
  orgs: ["lab-b"],
  repos: [
    { owner: "lab-b", repo: "core", sourceUrl: "https://github.com/lab-b/core" },
  ],
};

function makeEvent(
  id: string,
  type: string,
  offsetMsFromNow: number,
): Record<string, unknown> {
  const createdAt = new Date(FIXED_NOW.getTime() - offsetMsFromNow).toISOString();
  return {
    id,
    type,
    actor: { id: 1, login: "x", avatar_url: "" },
    repo: { id: 1, name: "x/x", url: "" },
    created_at: createdAt,
  };
}

function fetchStub(
  perRepo: Record<string, { status: number; body: unknown } | "throw">,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    // Match /repos/{owner}/{repo}/events
    const m = url.match(/\/repos\/([^/]+)\/([^/]+)\/events/);
    if (!m) throw new Error(`unexpected url ${url}`);
    const key = `${m[1]}/${m[2]}`;
    const entry = perRepo[key];
    if (!entry) throw new Error(`no stub for ${key}`);
    if (entry === "throw") throw new Error(`boom ${key}`);
    return new Response(JSON.stringify(entry.body), {
      status: entry.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function runOpts(fetchImpl: typeof fetch, registry: LabEntry[] = [labA, labB]): LabsFetchOptions {
  return {
    now: FIXED_NOW,
    registryOverride: registry,
    fetchImpl,
    token: "test-token",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchLabActivity", () => {
  it("buckets events per repo and per type", async () => {
    const fetchImpl = fetchStub({
      "lab-a/flagship": {
        status: 200,
        body: [
          makeEvent("1", "PushEvent", 60_000),
          makeEvent("2", "PullRequestEvent", 120_000),
          makeEvent("3", "PushEvent", 180_000),
        ],
      },
      "lab-a/other": {
        status: 200,
        body: [makeEvent("4", "IssuesEvent", 300_000)],
      },
      "lab-b/core": {
        status: 200,
        body: [makeEvent("5", "ReleaseEvent", 60_000)],
      },
    });

    const result = await fetchLabActivity(runOpts(fetchImpl));
    expect(result.labs).toHaveLength(2);

    const a = result.labs.find((l) => l.id === "lab-a")!;
    expect(a.total).toBe(4);
    expect(a.byType.PushEvent).toBe(2);
    expect(a.byType.PullRequestEvent).toBe(1);
    expect(a.byType.IssuesEvent).toBe(1);
    expect(a.repos).toHaveLength(2);
    expect(a.repos.find((r) => r.repo === "flagship")!.total).toBe(3);
    expect(a.repos.find((r) => r.repo === "other")!.total).toBe(1);
    expect(a.stale).toBe(false);

    const b = result.labs.find((l) => l.id === "lab-b")!;
    expect(b.total).toBe(1);
    expect(b.byType.ReleaseEvent).toBe(1);
    expect(b.stale).toBe(false);

    expect(result.failures).toHaveLength(0);
  });

  it("drops events outside the exact 7d window", async () => {
    const justInside = WINDOW_MS - 1;
    const justOutside = WINDOW_MS + 1;

    const fetchImpl = fetchStub({
      "lab-a/flagship": {
        status: 200,
        body: [
          makeEvent("1", "PushEvent", justInside),
          makeEvent("2", "PushEvent", justOutside),
          makeEvent("3", "PushEvent", 0),
        ],
      },
      "lab-a/other": { status: 200, body: [] },
      "lab-b/core": { status: 200, body: [] },
    });

    const result = await fetchLabActivity(runOpts(fetchImpl));
    const a = result.labs.find((l) => l.id === "lab-a")!;
    expect(a.total).toBe(2);
  });

  it("filters out irrelevant event types (e.g. DeleteEvent)", async () => {
    const fetchImpl = fetchStub({
      "lab-a/flagship": {
        status: 200,
        body: [
          makeEvent("1", "PushEvent", 60_000),
          makeEvent("2", "DeleteEvent", 60_000),
          makeEvent("3", "MemberEvent", 60_000),
        ],
      },
      "lab-a/other": { status: 200, body: [] },
      "lab-b/core": { status: 200, body: [] },
    });

    const result = await fetchLabActivity(runOpts(fetchImpl));
    const a = result.labs.find((l) => l.id === "lab-a")!;
    expect(a.total).toBe(1);
    expect(a.byType.PushEvent).toBe(1);
    expect(Object.keys(a.byType)).not.toContain("DeleteEvent");
  });

  it("marks one lab stale when one of its repos fails, others unaffected", async () => {
    const fetchImpl = fetchStub({
      "lab-a/flagship": "throw",
      "lab-a/other": { status: 200, body: [makeEvent("1", "PushEvent", 60_000)] },
      "lab-b/core": { status: 200, body: [makeEvent("2", "PushEvent", 60_000)] },
    });

    const result = await fetchLabActivity(runOpts(fetchImpl));
    const a = result.labs.find((l) => l.id === "lab-a")!;
    expect(a.stale).toBe(true);
    expect(a.total).toBe(1);
    expect(a.repos.find((r) => r.repo === "flagship")!.stale).toBe(true);
    expect(a.repos.find((r) => r.repo === "other")!.stale).toBe(false);

    const b = result.labs.find((l) => l.id === "lab-b")!;
    expect(b.stale).toBe(false);
    expect(b.total).toBe(1);

    expect(result.failures.some((f) => f.step.includes("lab-a/flagship"))).toBe(true);
  });

  it("treats non-200 responses as stale, not thrown", async () => {
    const fetchImpl = fetchStub({
      "lab-a/flagship": { status: 403, body: { message: "rate limited" } },
      "lab-a/other": { status: 200, body: [] },
      "lab-b/core": { status: 200, body: [] },
    });
    const result = await fetchLabActivity(runOpts(fetchImpl));
    const a = result.labs.find((l) => l.id === "lab-a")!;
    expect(a.stale).toBe(true);
    expect(a.repos.find((r) => r.repo === "flagship")!.stale).toBe(true);
  });

  it("returns a non-empty result even if every repo fails", async () => {
    const fetchImpl = fetchStub({
      "lab-a/flagship": "throw",
      "lab-a/other": "throw",
      "lab-b/core": "throw",
    });
    const result = await fetchLabActivity(runOpts(fetchImpl));
    expect(result.labs).toHaveLength(2);
    for (const lab of result.labs) {
      expect(lab.total).toBe(0);
      expect(lab.stale).toBe(true);
    }
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it("preserves all curated LabEntry static fields in the output", async () => {
    const fetchImpl = fetchStub({
      "lab-a/flagship": { status: 200, body: [] },
      "lab-a/other": { status: 200, body: [] },
      "lab-b/core": { status: 200, body: [] },
    });
    const result = await fetchLabActivity(runOpts(fetchImpl));
    const a = result.labs.find((l) => l.id === "lab-a")!;
    expect(a.displayName).toBe("Lab A");
    expect(a.kind).toBe("labs");
    expect(a.city).toBe("Testville");
    expect(a.country).toBe("US");
    expect(a.lat).toBe(37.77);
    expect(a.lng).toBe(-122.42);
    expect(a.hqSourceUrl).toBe("https://example.com/a");
    expect(a.orgs).toEqual(["lab-a"]);
  });

  it("exposes LABS_RELEVANT_TYPES aligned to fetch-events RELEVANT_TYPES", () => {
    expect(LABS_RELEVANT_TYPES.has("PushEvent")).toBe(true);
    expect(LABS_RELEVANT_TYPES.has("PullRequestEvent")).toBe(true);
    expect(LABS_RELEVANT_TYPES.has("IssuesEvent")).toBe(true);
    expect(LABS_RELEVANT_TYPES.has("ReleaseEvent")).toBe(true);
    expect(LABS_RELEVANT_TYPES.has("ForkEvent")).toBe(true);
    expect(LABS_RELEVANT_TYPES.has("WatchEvent")).toBe(true);
    expect(LABS_RELEVANT_TYPES.has("CreateEvent")).toBe(true);
    expect(LABS_RELEVANT_TYPES.has("IssueCommentEvent")).toBe(true);
    expect(LABS_RELEVANT_TYPES.has("PullRequestReviewEvent")).toBe(true);
    expect(LABS_RELEVANT_TYPES.has("DeleteEvent")).toBe(false);
    expect(LABS_RELEVANT_TYPES.has("MemberEvent")).toBe(false);
  });

  it("sets generatedAt to now().toISOString()", async () => {
    const fetchImpl = fetchStub({
      "lab-a/flagship": { status: 200, body: [] },
      "lab-a/other": { status: 200, body: [] },
      "lab-b/core": { status: 200, body: [] },
    });
    const result = await fetchLabActivity(runOpts(fetchImpl));
    expect(result.generatedAt).toBe(FIXED_NOW.toISOString());
  });

  it("honours a windowMs override so callers can re-bucket to 24h", async () => {
    // Events at 1h, 12h, 36h, 6d. A 24h window should keep only the first two.
    const hour = 60 * 60 * 1000;
    const fetchImpl = fetchStub({
      "lab-a/flagship": {
        status: 200,
        body: [
          makeEvent("1h", "PushEvent", 1 * hour),
          makeEvent("12h", "PushEvent", 12 * hour),
          makeEvent("36h", "PushEvent", 36 * hour),
          makeEvent("6d", "PushEvent", 6 * 24 * hour),
        ],
      },
      "lab-a/other": { status: 200, body: [] },
      "lab-b/core": { status: 200, body: [] },
    });
    const opts = { ...runOpts(fetchImpl), windowMs: 24 * hour };
    const result = await fetchLabActivity(opts);
    const a = result.labs.find((l) => l.id === "lab-a")!;
    expect(a.total).toBe(2);
  });
});
