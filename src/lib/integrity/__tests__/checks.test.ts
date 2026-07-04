import { describe, expect, it } from "vitest";
import {
  buildReport,
  checkFreshness,
  checkNonEmpty,
  checkNotFabricated,
  checkOrdering,
  checkProvenance,
  checkSanityRange,
  checkVerified,
  deriveVerdict,
  type CheckResult,
} from "@/lib/integrity/checks";

// A fixed "now" so freshness tests are deterministic (no Date.now()).
const NOW = Date.parse("2026-06-28T12:00:00.000Z");

describe("checkVerified", () => {
  it("passes a source with a verifiedAt date", () => {
    expect(checkVerified({ verifiedAt: "2026-04-18" })).toMatchObject({
      ok: true,
    });
  });

  it("fails an unverified source (empty string) as critical", () => {
    const r = checkVerified({ verifiedAt: "" });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("critical");
  });

  it("treats whitespace-only verifiedAt as unverified", () => {
    expect(checkVerified({ verifiedAt: "   " }).ok).toBe(false);
  });
});

describe("checkProvenance", () => {
  it("passes when every record has a non-empty source", () => {
    const r = checkProvenance([
      { source: "gh-events" },
      { source: "redis" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("fails (critical) when any record is missing a source", () => {
    const r = checkProvenance([{ source: "gh-events" }, { value: 5 }]);
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("critical");
    expect(r.detail).toContain("1/2");
  });

  it("treats empty-string source as missing", () => {
    expect(checkProvenance([{ source: "" }]).ok).toBe(false);
  });

  it("passes vacuously on an empty record set (emptiness is not its job)", () => {
    expect(checkProvenance([]).ok).toBe(true);
  });

  it("honours a custom provenance field name", () => {
    expect(
      checkProvenance([{ citation: "x" }], { field: "citation" }).ok,
    ).toBe(true);
    expect(
      checkProvenance([{ citation: "" }], { field: "citation" }).ok,
    ).toBe(false);
  });
});

describe("checkFreshness", () => {
  it("passes data within the age budget", () => {
    const observedAt = "2026-06-28T11:30:00.000Z"; // 30m old
    const r = checkFreshness({ observedAt, now: NOW, maxAgeMinutes: 90 });
    expect(r.ok).toBe(true);
  });

  it("flags stale data older than the budget", () => {
    const observedAt = "2026-06-28T08:00:00.000Z"; // 240m old
    const r = checkFreshness({ observedAt, now: NOW, maxAgeMinutes: 90 });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("stale");
    expect(r.detail).toContain("240m");
  });

  it("passes exactly at the boundary", () => {
    const observedAt = "2026-06-28T10:30:00.000Z"; // exactly 90m
    expect(
      checkFreshness({ observedAt, now: NOW, maxAgeMinutes: 90 }).ok,
    ).toBe(true);
  });

  it("treats a missing timestamp as critical, not stale", () => {
    const r = checkFreshness({ observedAt: null, now: NOW, maxAgeMinutes: 90 });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("critical");
  });

  it("treats an unparseable timestamp as critical", () => {
    const r = checkFreshness({
      observedAt: "not-a-date",
      now: NOW,
      maxAgeMinutes: 90,
    });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("critical");
  });
});

describe("checkSanityRange", () => {
  it("passes a value inside the pre-committed range", () => {
    expect(
      checkSanityRange({ value: 500, expectedMin: 100, expectedMax: 800 }).ok,
    ).toBe(true);
  });

  it("flags a value below min as warn (investigate, not crash)", () => {
    const r = checkSanityRange({ value: 0, expectedMin: 100, expectedMax: 800 });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("warn");
    expect(r.detail).toContain("below min 100");
  });

  it("flags a value above max as warn", () => {
    const r = checkSanityRange({ value: 9999, expectedMin: 100, expectedMax: 800 });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("warn");
  });

  it("passes the min/max boundaries inclusively", () => {
    expect(checkSanityRange({ value: 100, expectedMin: 100, expectedMax: 800 }).ok).toBe(true);
    expect(checkSanityRange({ value: 800, expectedMin: 100, expectedMax: 800 }).ok).toBe(true);
  });

  it("passes when no bounds are declared (nothing to check)", () => {
    const r = checkSanityRange({ value: 12345 });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("no range declared");
  });

  it("checks a one-sided (min-only) range", () => {
    expect(checkSanityRange({ value: 5, expectedMin: 10 }).ok).toBe(false);
    expect(checkSanityRange({ value: 50, expectedMin: 10 }).ok).toBe(true);
  });

  it("treats a missing value as critical (cannot verify accuracy)", () => {
    const r = checkSanityRange({ value: null, expectedMin: 1, expectedMax: 9 });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("critical");
  });
});

describe("checkOrdering", () => {
  it("passes when the ordering is one of the real products", () => {
    expect(
      checkOrdering({ ordering: "top-weekly", expected: ["top-weekly", "trending"] }).ok,
    ).toBe(true);
    expect(
      checkOrdering({ ordering: "trending", expected: ["top-weekly", "trending"] }).ok,
    ).toBe(true);
  });

  it("flags a fallback ordering as warn — the S91 masked-blindness class", () => {
    const r = checkOrdering({
      ordering: "catalogue-fallback",
      expected: ["top-weekly", "trending"],
    });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("warn");
    expect(r.detail).toContain("catalogue-fallback");
  });

  it("flags a missing ordering", () => {
    const r = checkOrdering({ ordering: null, expected: ["top-weekly"] });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("missing");
  });
});

describe("checkNonEmpty", () => {
  it("passes when count meets the floor", () => {
    expect(checkNonEmpty({ count: 25, floor: 1 }).ok).toBe(true);
  });

  it("flags an unexpected empty as warn (possibly broken-empty)", () => {
    const r = checkNonEmpty({ count: 0, floor: 1 });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("warn");
    expect(r.detail).toContain("broken-empty");
  });

  it("passes an empty output when a quiet day is explicitly allowed", () => {
    const r = checkNonEmpty({ count: 0, floor: 1, quietDayAllowed: true });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("quiet day");
  });

  it("defaults the floor to 1", () => {
    expect(checkNonEmpty({ count: 0 }).ok).toBe(false);
    expect(checkNonEmpty({ count: 1 }).ok).toBe(true);
  });
});

describe("checkNotFabricated", () => {
  it("passes a set of real records", () => {
    expect(
      checkNotFabricated([{ source: "gh-events" }, { source: "redis" }]).ok,
    ).toBe(true);
  });

  it("fails (critical) when any record is flagged synthetic", () => {
    const r = checkNotFabricated([{}, { synthetic: true }]);
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("critical");
  });

  it("fails when any record is flagged simulated", () => {
    expect(checkNotFabricated([{ simulated: true }]).ok).toBe(false);
  });

  it("passes an empty set (nothing fabricated)", () => {
    expect(checkNotFabricated([]).ok).toBe(true);
  });
});

describe("deriveVerdict — precedence FAIL > STALE > DEGRADED > OK", () => {
  const ok = (name: string): CheckResult => ({ name, ok: true, severity: "info" });
  const fail = (name: string, severity: CheckResult["severity"]): CheckResult => ({
    name,
    ok: false,
    severity,
  });

  it("returns OK when all checks pass", () => {
    expect(deriveVerdict([ok("a"), ok("b")])).toBe("OK");
  });

  it("returns DEGRADED on a lone warn", () => {
    expect(deriveVerdict([ok("a"), fail("sanity", "warn")])).toBe("DEGRADED");
  });

  it("returns STALE when stale outranks a warn", () => {
    expect(
      deriveVerdict([fail("sanity", "warn"), fail("freshness", "stale")]),
    ).toBe("STALE");
  });

  it("returns FAIL when a critical outranks everything", () => {
    expect(
      deriveVerdict([
        fail("freshness", "stale"),
        fail("sanity", "warn"),
        fail("provenance", "critical"),
      ]),
    ).toBe("FAIL");
  });

  it("ignores the severity of passing checks", () => {
    // a passing check never worsens the verdict even if it carries a
    // non-info severity by mistake
    expect(
      deriveVerdict([{ name: "x", ok: true, severity: "critical" }]),
    ).toBe("OK");
  });

  it("returns OK on no checks (nothing to fault)", () => {
    expect(deriveVerdict([])).toBe("OK");
  });
});

describe("buildReport — realistic gawk scenarios", () => {
  it("a healthy globe-events output reports OK", () => {
    // Mirrors GET /api/globe-events: { polledAt, source, points[] }
    const points = [
      { source: "redis" },
      { source: "redis" },
    ];
    const report = buildReport({
      source: "globe-events",
      observedAt: "2026-06-28T11:52:54.000Z",
      checks: [
        checkProvenance(points),
        checkNotFabricated(points),
        checkFreshness({
          observedAt: "2026-06-28T11:52:54.000Z",
          now: NOW,
          maxAgeMinutes: 90,
        }),
        checkSanityRange({ value: points.length, expectedMin: 1 }),
      ],
    });
    expect(report.verdict).toBe("OK");
  });

  it("the digest-style 'green but delivered nothing' case reports FAIL", () => {
    // The real incident: route said ok:true but sent 0 emails. Verified
    // against OUTPUT (0 items, no provenance) the integrity layer is not
    // fooled — it fails where the self-report lied.
    const report = buildReport({
      source: "daily-digest",
      observedAt: "2026-06-28T10:20:00.000Z",
      checks: [
        checkNonEmpty({ count: 0, floor: 1 }), // 0 sent → warn
        checkProvenance([], { field: "messageId" }), // vacuous pass
        checkFreshness({ observedAt: null, now: NOW, maxAgeMinutes: 1440 }), // no delivery timestamp → critical
      ],
    });
    expect(report.verdict).toBe("FAIL");
  });

  it("an out-of-range but fresh source reports DEGRADED, not FAIL", () => {
    const report = buildReport({
      source: "gh-events",
      observedAt: "2026-06-28T11:30:00.000Z",
      checks: [
        checkFreshness({
          observedAt: "2026-06-28T11:30:00.000Z",
          now: NOW,
          maxAgeMinutes: 90,
        }),
        checkSanityRange({ value: 12, expectedMin: 100, expectedMax: 800 }),
      ],
    });
    expect(report.verdict).toBe("DEGRADED");
  });

  it("a synthetic globe dot reports FAIL (non-negotiable breach)", () => {
    const report = buildReport({
      source: "globe-events",
      observedAt: "2026-06-28T11:52:00.000Z",
      checks: [
        checkNotFabricated([{ source: "redis" }, { simulated: true }]),
      ],
    });
    expect(report.verdict).toBe("FAIL");
  });
});
