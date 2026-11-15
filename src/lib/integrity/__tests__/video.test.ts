import { describe, expect, it } from "vitest";
import { evaluateVideo, isWorkflowPaused } from "@/lib/integrity/video";

const NOW = Date.parse("2026-06-28T12:00:00.000Z");
const DAY = 1440;

describe("evaluateVideo", () => {
  it("OK when today's video exists and resolves on YouTube", () => {
    const r = evaluateVideo({
      latest: { date: "2026-06-28", url: "https://youtu.be/APxMGkUsBM0" },
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: "Sakana: Fugu Ultra takes #1 | gawk.dev Daily — 28 June 2026",
    });
    expect(r.verdict).toBe("OK");
  });

  it("STALE when the last upload is too old (uploads stopped)", () => {
    const r = evaluateVideo({
      latest: { date: "2026-06-18", url: "https://youtu.be/1Y-aefaqNTU" },
      now: NOW,
      maxAgeMinutes: 2 * DAY, // 10 days old >> 2 days
      oembedTitle: "old but live",
    });
    expect(r.verdict).toBe("STALE");
  });

  it("FAIL when the entry is recent but the video does not resolve (green job, no real upload)", () => {
    const r = evaluateVideo({
      latest: { date: "2026-06-28", url: "https://youtu.be/broken" },
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: null, // oEmbed failed → not actually public
    });
    expect(r.verdict).toBe("FAIL");
  });

  it("FAIL when there are no upload-log entries at all", () => {
    const r = evaluateVideo({
      latest: null,
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: null,
    });
    expect(r.verdict).toBe("FAIL");
    expect(r.checks[0].name).toBe("exists");
  });

  it("treats an empty oEmbed title as not-live", () => {
    const r = evaluateVideo({
      latest: { date: "2026-06-28", url: "https://youtu.be/x" },
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: "   ",
    });
    expect(r.verdict).toBe("FAIL");
  });
});

describe("evaluateVideo — workflow paused on GitHub", () => {
  const stale = { date: "2026-06-18", url: "https://youtu.be/1Y-aefaqNTU" };

  it("paused and stale: not STALE, and the detail states the pause and the last upload", () => {
    const r = evaluateVideo({
      latest: stale,
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: "old but live",
      paused: true,
    });
    expect(r.verdict).toBe("OK");
    const f = r.checks.find((c) => c.name === "freshness");
    expect(f?.ok).toBe(true);
    expect(f?.detail).toMatch(/paused/);
    expect(f?.detail).toContain("2026-06-18");
  });

  it("active and stale: STALE", () => {
    const r = evaluateVideo({
      latest: stale,
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: "old but live",
      paused: false,
    });
    expect(r.verdict).toBe("STALE");
  });

  it("paused but the last video no longer resolves: still FAIL", () => {
    const r = evaluateVideo({
      latest: stale,
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: null,
      paused: true,
    });
    expect(r.verdict).toBe("FAIL");
  });

  it("paused with no upload-log entries: still FAIL", () => {
    const r = evaluateVideo({ latest: null, now: NOW, maxAgeMinutes: 2 * DAY, oembedTitle: null, paused: true });
    expect(r.verdict).toBe("FAIL");
  });

  it("paused and fresh: the ordinary freshness detail, no pause wording", () => {
    const r = evaluateVideo({
      latest: { date: "2026-06-28", url: "https://youtu.be/APxMGkUsBM0" },
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: "live",
      paused: true,
    });
    expect(r.verdict).toBe("OK");
    expect(r.checks.find((c) => c.name === "freshness")?.detail).not.toMatch(/paused/);
  });
});

describe("isWorkflowPaused", () => {
  it("true only for a workflow someone disabled by hand", () => {
    expect(isWorkflowPaused({ state: "disabled_manually" })).toBe(true);
  });

  it("false for an active workflow", () => {
    expect(isWorkflowPaused({ state: "active" })).toBe(false);
  });

  it("false when GitHub disabled it for inactivity — nobody decided that", () => {
    expect(isWorkflowPaused({ state: "disabled_inactivity" })).toBe(false);
  });

  it("false when the state could not be read (so a stale video still pages)", () => {
    expect(isWorkflowPaused(null)).toBe(false);
    expect(isWorkflowPaused(undefined)).toBe(false);
    expect(isWorkflowPaused({ message: "Not Found" })).toBe(false);
    expect(isWorkflowPaused("disabled_manually")).toBe(false);
  });
});
