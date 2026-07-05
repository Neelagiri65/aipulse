import { describe, expect, it } from "vitest";

import { deltasFromCounts } from "@/lib/data/sdk-adoption-deltas";
import { auditItem, checkDeltaProvenance } from "@/lib/trust/invariants";

/**
 * OUTPUT-LEVEL trust test for the SDK-adoption delta engine, pinning the
 * +734% incident class (S79/80): a spurious spike — a package whose count
 * jumps implausibly above its own recent baseline (mirror-hit storm, CI
 * build wave, counter reset) — must NOT be shown as a real % move. The
 * engine suppresses any |delta| > 5 (500%) to null; that guard existed but
 * was UNPINNED, so a refactor could silently reintroduce the fabricated
 * spike. This locks it, and frames it through the shared delta-provenance
 * invariant so "no fabricated movement" means the same thing here as for
 * benchmarks and model-usage.
 */

/** Does a computed cell CLAIM a real % movement (non-null delta)? */
function claimsMovement(cell: { delta: number | null }): boolean {
  return cell.delta !== null;
}

describe("sdk-adoption deltas — implausible-spike suppression (+734% class)", () => {
  it("THE INCIDENT: a 700%+ jump over a stable baseline is suppressed to null", () => {
    // 30 stable days ~1000, then a spike to 8000 (+700%).
    const counts = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      count: 1000,
    }));
    counts.push({ date: "2026-07-01", count: 8000 });
    const out = deltasFromCounts(counts);
    const spike = out[out.length - 1];
    expect(spike.count).toBe(8000); // the raw number is still honest
    expect(spike.delta).toBeNull(); // but no fabricated % movement is asserted
    // The invariant: an implausible spike has no trustworthy baseline-delta.
    expect(auditItem([checkDeltaProvenance(claimsMovement(spike), false)])).toEqual([]);
  });

  it("a PLAUSIBLE move (within 500%) is shown — the guard doesn't over-suppress", () => {
    const counts = Array.from({ length: 30 }, () => ({ date: "d", count: 1000 }));
    counts.push({ date: "2026-07-01", count: 2500 }); // +150%
    const out = deltasFromCounts(counts);
    const move = out[out.length - 1];
    expect(move.delta).toBeCloseTo(1.5, 5);
  });

  it("a brand-new package (zero baseline) shows no % delta — never div-by-zero noise", () => {
    const out = deltasFromCounts([
      { date: "d1", count: 0 },
      { date: "d2", count: 5000 },
    ]);
    expect(out[1].delta).toBeNull();
    expect(claimsMovement(out[1])).toBe(false);
  });
});
