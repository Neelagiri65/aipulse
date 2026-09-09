import { describe, it, expect } from "vitest";
import { seedFreshnessAt } from "@/lib/hooks/use-polled-endpoint";
import { freshnessLabel } from "@/components/chrome/TopBar";

const MOUNT = 1_757_000_000_000;

describe("seedFreshnessAt", () => {
  it("ages a server payload from its own poll time, not from hydration", () => {
    // The page is prerendered and revalidated every 5 minutes, so the HTML can
    // be minutes old when it is read. Restarting the clock at mount reported
    // that data as a fresh poll.
    const polledAt = MOUNT - 4 * 60 * 1000;
    expect(seedFreshnessAt({ ok: true }, polledAt, MOUNT)).toBe(polledAt);
  });

  it("falls back to now only when the payload does not date itself", () => {
    expect(seedFreshnessAt({ ok: true }, undefined, MOUNT)).toBe(MOUNT);
  });

  it("has no freshness to report when there is no seeded value", () => {
    expect(seedFreshnessAt(undefined, MOUNT, MOUNT)).toBeUndefined();
  });
});

describe("freshnessLabel", () => {
  it("states a clock time before hydration — a frozen relative age is a lie", () => {
    expect(
      freshnessLabel({ mounted: false, ageMs: 1000, stale: false, at: Date.UTC(2026, 8, 9, 4, 53) }),
    ).toBe("polled 04:53 UTC");
  });

  it("switches to a live age once it can keep it updated", () => {
    expect(freshnessLabel({ mounted: true, ageMs: 12_000, stale: false, at: MOUNT })).toBe(
      "live · 12s",
    );
    expect(freshnessLabel({ mounted: true, ageMs: 15 * 60_000, stale: true, at: MOUNT })).toBe(
      "stale · 15m",
    );
  });
});
