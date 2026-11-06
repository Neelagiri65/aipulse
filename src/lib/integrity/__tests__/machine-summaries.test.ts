import { describe, expect, it } from "vitest";
import { evaluateMachineSummaries, MODEL_FAIL_STREAK_PAGE } from "@/lib/integrity/machine-summaries";

const NOW = Date.parse("2026-11-06T12:00:00Z");

describe("evaluateMachineSummaries — a dead model must page, not hide for a week", () => {
  it("off → OK, says it is off", () => {
    const r = evaluateMachineSummaries({ enabled: false, health: null, now: NOW });
    expect(r.source).toBe("machine-summaries");
    expect(r.verdict).toBe("OK");
    expect(r.checks[0].detail).toMatch(/off/);
  });

  it("on, no model call recorded yet → OK, says so", () => {
    const r = evaluateMachineSummaries({ enabled: true, health: null, now: NOW });
    expect(r.verdict).toBe("OK");
    expect(r.checks[0].detail).toMatch(/no model call recorded/);
  });

  it("a streak below the threshold is OK", () => {
    const r = evaluateMachineSummaries({
      enabled: true,
      health: { failStreak: MODEL_FAIL_STREAK_PAGE - 1, lastOkAt: "2026-11-05T23:19:29Z", lastFailAt: "2026-11-06T10:00:00Z" },
      now: NOW,
    });
    expect(r.verdict).toBe("OK");
  });

  it(`${MODEL_FAIL_STREAK_PAGE} consecutive failed model calls → FAIL (pages), with the last good answer's time`, () => {
    const r = evaluateMachineSummaries({
      enabled: true,
      health: { failStreak: MODEL_FAIL_STREAK_PAGE, lastOkAt: "2026-10-29T08:00:00Z", lastFailAt: "2026-11-06T10:00:00Z" },
      now: NOW,
    });
    expect(r.verdict).toBe("FAIL");
    expect(r.checks[0].detail).toContain(`${MODEL_FAIL_STREAK_PAGE} consecutive`);
    expect(r.checks[0].detail).toContain("2026-10-29T08:00:00Z");
  });

  it("a model that has never answered says never", () => {
    const r = evaluateMachineSummaries({
      enabled: true,
      health: { failStreak: 5, lastOkAt: null, lastFailAt: "2026-11-06T10:00:00Z" },
      now: NOW,
    });
    expect(r.verdict).toBe("FAIL");
    expect(r.checks[0].detail).toMatch(/never/);
  });

  it("an unreadable health record is DEGRADED — 'could not look' is not 'healthy'", () => {
    const r = evaluateMachineSummaries({ enabled: true, health: "unreadable", now: NOW });
    expect(r.verdict).toBe("DEGRADED");
    expect(r.checks[0].detail).toMatch(/could not read/);
  });
});
