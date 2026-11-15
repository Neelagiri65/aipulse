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

describe("evaluateMachineSummaries — a rejected API key says so, and pages on the first call", () => {
  const health = (failStreak: number, keyRejected?: boolean) => ({
    failStreak, lastOkAt: "2026-11-09T19:26:29Z", lastFailAt: "2026-11-10T14:47:49Z", keyRejected,
  });

  it("one rejected call → FAIL, and the detail names the key, not the model", () => {
    const r = evaluateMachineSummaries({ enabled: true, health: health(1, true), now: NOW });
    expect(r.verdict).toBe("FAIL");
    expect(r.checks[0].detail).toMatch(/API key was rejected/);
    expect(r.checks[0].detail).toContain("2026-11-09T19:26:29Z");
    expect(r.checks[0].detail).not.toMatch(/model failed/);
  });

  it("one failure of any other kind stays below the threshold", () => {
    expect(evaluateMachineSummaries({ enabled: true, health: health(1, false), now: NOW }).verdict).toBe("OK");
    expect(evaluateMachineSummaries({ enabled: true, health: health(1), now: NOW }).verdict).toBe("OK");
  });

  it("a long streak whose latest failure was not a rejected key keeps the model wording", () => {
    const r = evaluateMachineSummaries({ enabled: true, health: health(21, false), now: NOW });
    expect(r.verdict).toBe("FAIL");
    expect(r.checks[0].detail).toMatch(/model failed 21 consecutive calls/);
  });

  it("the public detail carries no provider error body", () => {
    const r = evaluateMachineSummaries({ enabled: true, health: health(4, true), now: NOW });
    expect(r.checks[0].detail).not.toMatch(/Forbidden|Authorization failed/);
  });
});
