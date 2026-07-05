import { describe, expect, it } from "vitest";

import {
  dedupeAndFilterEvents,
  isDurableStoredType,
  type IngestSourceKind,
} from "@/lib/data/fetch-events";
import type { GitHubEvent } from "@/lib/github";

/**
 * OUTPUT-LEVEL tests for the ingest filter — the gate that decides which
 * raw events become map dots. These reconstruct the 2026-07-05 incident:
 * a spam account (`amendashelani-commits`, created minutes earlier)
 * starred a 6-year-dormant repo; the WatchEvent reached the live map, and
 * when a viewer clicked through the repo showed 0 stars — the dot
 * contradicted reality. Unit tests of "does the mapper map" were all green
 * and caught none of it, because they tested logic, not output. These
 * assert the PROPERTY that matters: only durable, verifiable events pass.
 *
 * They call `dedupeAndFilterEvents` — the exact function `runIngest` uses
 * — so they exercise the real code path, not a parallel reimplementation.
 */

function ev(
  type: string,
  overrides: Partial<{ id: string; actor: string; repo: string; at: string }> = {},
): { event: GitHubEvent; source: IngestSourceKind } {
  return {
    source: "events-api",
    event: {
      id: overrides.id ?? `${type}-1`,
      type,
      actor: { id: 1, login: overrides.actor ?? "octocat", avatar_url: "", url: "" },
      repo: { id: 1, name: overrides.repo ?? "owner/repo", url: "" },
      created_at: overrides.at ?? "2026-07-05T00:00:00Z",
    } as unknown as GitHubEvent,
  };
}

describe("dedupeAndFilterEvents — the map-dot gate (durable evidence only)", () => {
  it("THE INCIDENT: a spam WatchEvent (star) never becomes a dot", () => {
    const out = dedupeAndFilterEvents([
      ev("WatchEvent", {
        actor: "amendashelani-commits",
        repo: "RashaniHathurusinghe/Rashi",
      }),
    ]);
    expect(out.size).toBe(0);
  });

  it("all non-durable types are excluded — a star/fork can vanish after the dot renders", () => {
    for (const t of ["WatchEvent", "ForkEvent"]) {
      expect(dedupeAndFilterEvents([ev(t)]).size).toBe(0);
    }
  });

  it("every durable-evidence type passes — each leaves a clickable artefact", () => {
    for (const t of [
      "PushEvent",
      "PullRequestEvent",
      "IssuesEvent",
      "IssueCommentEvent",
      "ReleaseEvent",
      "CreateEvent",
      "PullRequestReviewEvent",
    ]) {
      expect(dedupeAndFilterEvents([ev(t)]).size).toBe(1);
    }
  });

  it("a realistic mixed firehose batch keeps only the durable events", () => {
    const out = dedupeAndFilterEvents([
      ev("PushEvent", { id: "p1", repo: "torvalds/linux" }),
      ev("WatchEvent", { id: "w1", repo: "spam/dormant" }), // dropped
      ev("PullRequestEvent", { id: "pr1" }),
      ev("ForkEvent", { id: "f1" }), // dropped
      ev("ReleaseEvent", { id: "r1" }),
      ev("StarredEvent", { id: "x1" }), // unknown type, dropped
    ]);
    expect(Array.from(out.keys()).sort()).toEqual(["p1", "pr1", "r1"]);
  });

  it("dedupes by id; a live/tracked representation beats an archive duplicate", () => {
    const live = ev("PushEvent", { id: "same" });
    const archive = {
      ...ev("PushEvent", { id: "same" }),
      source: "gharchive" as const,
    };
    const out = dedupeAndFilterEvents([archive, live]);
    expect(out.size).toBe(1);
    expect(out.get("same")!.source).toBe("events-api");
  });
});

describe("isDurableStoredType — read-side serve gate", () => {
  it("a WatchEvent already in the store is NEVER served (immediate effect, no 4h wait)", () => {
    expect(isDurableStoredType({ type: "WatchEvent" })).toBe(false);
    expect(isDurableStoredType({ type: "ForkEvent" })).toBe(false);
  });
  it("durable stored types are served", () => {
    expect(isDurableStoredType({ type: "PushEvent" })).toBe(true);
    expect(isDurableStoredType({ type: "ReleaseEvent" })).toBe(true);
  });
  it("fails closed on missing/unknown type", () => {
    expect(isDurableStoredType({})).toBe(false);
    expect(isDurableStoredType(undefined)).toBe(false);
  });
});
