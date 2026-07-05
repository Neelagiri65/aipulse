import { describe, expect, it } from "vitest";

import { auditServedOutput } from "@/lib/trust/auditor";

const NOW = Date.parse("2026-07-05T12:00:00Z");
const FRESH = "2026-07-05T11:30:00Z";

describe("auditServedOutput — Layer B live invariants", () => {
  it("clean served output → ok, no findings", () => {
    const r = auditServedOutput({
      now: NOW,
      globe: {
        points: [
          { meta: { type: "PushEvent", repo: "torvalds/linux", createdAt: FRESH } },
          { meta: { type: "PullRequestEvent", repo: "org/x", createdAt: FRESH } },
        ],
      },
      feed: {
        lastComputed: FRESH,
        cards: [{ type: "MODEL_MOVER", sourceUrl: "https://openrouter.ai/rankings", timestamp: FRESH }],
      },
      modelUsage: { ordering: "top-weekly", generatedAt: FRESH, rows: [{}, {}] },
    });
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.checked).toEqual({ globe: 2, feed: 1, "model-usage": 2 });
  });

  it("catches the #54 class: a served WatchEvent dot", () => {
    const r = auditServedOutput({
      now: NOW,
      globe: { points: [{ meta: { type: "WatchEvent", repo: "spam/dead", createdAt: FRESH } }] },
    });
    expect(r.ok).toBe(false);
    expect(r.findings[0]).toMatchObject({ feed: "globe", invariant: "verifiable" });
  });

  it("catches the #53 class: a nested-host card source link", () => {
    const r = auditServedOutput({
      now: NOW,
      feed: {
        lastComputed: FRESH,
        cards: [
          {
            type: "NEW_RELEASE",
            sourceUrl: "https://github.com/gitlab.com/gitlab-org/gitlab-runner",
            timestamp: FRESH,
          },
        ],
      },
    });
    expect(r.findings.some((f) => f.invariant === "attributed")).toBe(true);
  });

  it("catches the S88 class: a stale dot served as live", () => {
    const r = auditServedOutput({
      now: NOW,
      globe: { points: [{ meta: { type: "PushEvent", repo: "x/y", createdAt: "2026-07-04T00:00:00Z" } }] },
    });
    expect(r.findings.some((f) => f.feed === "globe" && f.invariant === "fresh")).toBe(true);
  });

  it("catches the S91 class: a usage ranking on a catalogue-fallback ordering", () => {
    const r = auditServedOutput({
      now: NOW,
      modelUsage: { ordering: "catalogue-fallback", generatedAt: FRESH, rows: [{}, {}, {}] },
    });
    expect(r.findings.some((f) => f.feed === "model-usage" && f.invariant === "real")).toBe(true);
  });

  it("a catalogue-fallback with ZERO rows is cold-start, not a violation", () => {
    const r = auditServedOutput({
      now: NOW,
      modelUsage: { ordering: "catalogue-fallback", generatedAt: FRESH, rows: [] },
    });
    expect(r.findings.some((f) => f.feed === "model-usage" && f.invariant === "real")).toBe(false);
  });
});
