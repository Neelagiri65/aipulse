import { describe, expect, it } from "vitest";

import {
  assignSlots,
  createDecisionLog,
  toDecisionArchive,
  type Decision,
} from "../decision-log";

const skip = (headline: string): Decision => ({
  verdict: "skip",
  gate: "story-gate",
  reason: "no-metric",
  headline,
  source: "curated",
});
const accept = (id: string): Decision => ({
  verdict: "accept",
  id,
  headline: `${id} headline`,
  source: "curated",
});
const leadKept: Decision = {
  verdict: "lead-kept",
  reason: "lead fresh (led 0 prior days, limit 2)",
  lead: "DeepSeek V4 Flash holds #1 on OpenRouter",
};

describe("createDecisionLog", () => {
  it("collects decisions in the order they were taken", () => {
    const log = createDecisionLog();
    log.record(skip("a"));
    log.record(accept("b"));
    log.record(leadKept);
    expect(log.entries().map((d) => d.verdict)).toEqual(["skip", "accept", "lead-kept"]);
  });
});

describe("assignSlots", () => {
  it("stamps accepted decisions with their FINAL position — the lead gate may rotate after acceptance", () => {
    // Accepted in order hook, story-1; the lead gate rotated story-1 first.
    const decisions = [accept("hook"), skip("noise"), accept("story-1")];
    const stamped = assignSlots(decisions, ["story-1", "hook"]);
    const slots = Object.fromEntries(
      stamped.filter((d) => d.verdict === "accept").map((d) => [d.id, d.slot]),
    );
    expect(slots).toEqual({ "story-1": 0, hook: 1 });
    // Skips carry no slot
    expect(stamped.find((d) => d.verdict === "skip")).not.toHaveProperty("slot");
  });

  it("throws when an accepted story is missing from the final order — a drifted record must not be archived", () => {
    expect(() => assignSlots([accept("ghost")], ["other"])).toThrow(/drifted/);
  });
});

describe("toDecisionArchive", () => {
  const base = {
    date: "2026-07-06",
    capturedAt: "2026-07-06T09:00:00.000Z",
  };

  it("produces the envelope: v/capturedAt/generator + date, lead, counts, decisions", () => {
    const archive = toDecisionArchive({
      ...base,
      decisions: [accept("hook"), skip("noise"), skip("more noise"), leadKept],
      runUrl: "https://github.com/Neelagiri65/aipulse/actions/runs/1",
    });
    expect(archive.v).toBe(1);
    expect(archive.capturedAt).toBe(base.capturedAt);
    expect(archive.generator).toBe("scripts/video/generate-daily-script.ts");
    expect(archive.run).toContain("/actions/runs/1");
    expect(archive.record.date).toBe("2026-07-06");
    expect(archive.record.lead).toBe(leadKept.lead);
    expect(archive.record.counts).toEqual({ accepted: 1, skipped: 2 });
    expect(archive.record.decisions).toHaveLength(4);
  });

  it("omits the run field outside CI rather than fabricating one", () => {
    const archive = toDecisionArchive({ ...base, decisions: [accept("hook"), leadKept] });
    expect(archive).not.toHaveProperty("run");
  });

  it("throws without a lead-gate verdict — every video's title is a decision and must be recorded", () => {
    expect(() => toDecisionArchive({ ...base, decisions: [accept("hook")] })).toThrow(
      /exactly one lead-gate/,
    );
  });

  it("throws with two lead-gate verdicts", () => {
    expect(() =>
      toDecisionArchive({ ...base, decisions: [accept("hook"), leadKept, leadKept] }),
    ).toThrow(/exactly one lead-gate/);
  });

  it("throws with zero accepted stories — there is no video to trace", () => {
    expect(() => toDecisionArchive({ ...base, decisions: [skip("noise"), leadKept] })).toThrow(
      /zero accepted/,
    );
  });
});
