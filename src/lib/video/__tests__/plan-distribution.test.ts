/**
 * Distribution planner — pins the 2026-07-05 half-distributed-day
 * incident (video uploaded at 02:34Z by a local run, announcements
 * never sent, scheduled CI run skipped everything on the all-or-nothing
 * guard) and the local-guard that prevents the class at the root.
 */
import { describe, expect, it } from "vitest";

import { planDistribution } from "@/lib/video/plan-distribution";

const REQUESTED = ["youtube", "facebook", "discord"];
const CI = { isCi: true, allowLocalDistribute: false };
const NO_FLAGS = { forceDistribute: false, noDistribute: false };

describe("planDistribution", () => {
  it("THE INCIDENT: legacy today-entry (upload done, announcements unknown) → heals ONLY the announcements", () => {
    const plan = planDistribution({
      requested: REQUESTED,
      todayEntry: { date: "2026-07-05" }, // legacy shape — youtube-only knowledge
      ...NO_FLAGS,
      ...CI,
    });
    expect(plan).toEqual({
      kind: "run",
      platforms: ["facebook", "discord"],
      reason: "heal",
    });
  });

  it("local run without --allow-local-distribute NEVER distributes (kills the 02:34Z class)", () => {
    const plan = planDistribution({
      requested: REQUESTED,
      todayEntry: null,
      ...NO_FLAGS,
      isCi: false,
      allowLocalDistribute: false,
    });
    expect(plan).toEqual({ kind: "skip", reason: "local-guard" });
  });

  it("local run WITH --allow-local-distribute proceeds (explicit intent)", () => {
    const plan = planDistribution({
      requested: REQUESTED,
      todayEntry: null,
      ...NO_FLAGS,
      isCi: false,
      allowLocalDistribute: true,
    });
    expect(plan).toEqual({ kind: "run", platforms: REQUESTED, reason: "fresh" });
  });

  it("fresh day in CI → run everything", () => {
    const plan = planDistribution({
      requested: REQUESTED,
      todayEntry: null,
      ...NO_FLAGS,
      ...CI,
    });
    expect(plan).toEqual({ kind: "run", platforms: REQUESTED, reason: "fresh" });
  });

  it("fully-recorded day → all-done skip (duplicate-upload guard intact)", () => {
    const plan = planDistribution({
      requested: REQUESTED,
      todayEntry: { date: "2026-07-05", platforms: REQUESTED },
      ...NO_FLAGS,
      ...CI,
    });
    expect(plan).toEqual({ kind: "skip", reason: "all-done" });
  });

  it("--no-distribute wins over everything", () => {
    const plan = planDistribution({
      requested: REQUESTED,
      todayEntry: null,
      forceDistribute: true,
      noDistribute: true,
      ...CI,
    });
    expect(plan).toEqual({ kind: "skip", reason: "no-distribute" });
  });

  it("--force-distribute re-runs all requested platforms (existing override, unchanged)", () => {
    const plan = planDistribution({
      requested: REQUESTED,
      todayEntry: { date: "2026-07-05", platforms: REQUESTED },
      forceDistribute: true,
      noDistribute: false,
      ...CI,
    });
    expect(plan).toEqual({ kind: "run", platforms: REQUESTED, reason: "forced" });
  });

  it("partially-recorded modern entry heals exactly the gap", () => {
    const plan = planDistribution({
      requested: REQUESTED,
      todayEntry: { date: "2026-07-05", platforms: ["youtube", "facebook"] },
      ...NO_FLAGS,
      ...CI,
    });
    expect(plan).toEqual({ kind: "run", platforms: ["discord"], reason: "heal" });
  });
});
