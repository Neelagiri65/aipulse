import { describe, expect, it } from "vitest";

import {
  computeDeltas,
  type ArenaRow,
} from "@/lib/data/benchmarks-lmarena";
import {
  auditItem,
  checkDeltaProvenance,
} from "@/lib/trust/invariants";

/**
 * OUTPUT-LEVEL trust test for the benchmarks feed (previously ZERO tests,
 * and it carries the highest-stakes numbers on the site — Elo ranks). The
 * invariant is the S91 fabrication class applied to Elo: a rank/Elo delta
 * may ONLY be asserted against a real, matched prior row. A new or
 * unmatched model must read `new`, never a fabricated up/down.
 *
 * Exercises the real `computeDeltas` (the pure core `buildPayload` uses),
 * not a copy.
 */

function row(rank: number, modelName: string, rating: number): ArenaRow {
  return {
    rank,
    modelName,
    organization: "org",
    rating,
    ratingLower: rating - 5,
    ratingUpper: rating + 5,
    voteCount: 10000,
    category: "overall",
    leaderboardPublishDate: "2026-07-04",
  };
}

/** Does a computed row CLAIM movement (an up/down delta)? */
function claimsMovement(r: { rankDelta: { kind: string } }): boolean {
  return r.rankDelta.kind === "up" || r.rankDelta.kind === "down";
}

describe("benchmarks — delta-provenance (no fabricated Elo/rank movement)", () => {
  it("NO previous snapshot → every row is `new`, ZERO movement claims", () => {
    const out = computeDeltas(
      [row(1, "claude-opus", 1500), row(2, "gpt-5", 1490)],
      null,
    );
    for (const r of out) {
      expect(r.rankDelta.kind).toBe("new");
      // The invariant: a movement claim requires a real baseline.
      expect(
        auditItem([checkDeltaProvenance(claimsMovement(r), false)]),
      ).toEqual([]);
    }
  });

  it("a model ABSENT from the previous snapshot → `new`, never a manufactured delta", () => {
    const prev = [row(1, "claude-opus", 1500)];
    const cur = [row(1, "claude-opus", 1500), row(2, "brand-new-model", 1480)];
    const out = computeDeltas(cur, prev);
    const fresh = out.find((r) => r.modelName === "brand-new-model")!;
    expect(fresh.rankDelta.kind).toBe("new");
    expect(claimsMovement(fresh)).toBe(false);
  });

  it("a REAL matched move produces a delta WITH a baseline — provenance holds", () => {
    const prev = [row(1, "gpt-5", 1500), row(2, "claude-opus", 1490)];
    const cur = [row(1, "claude-opus", 1495), row(2, "gpt-5", 1492)];
    const out = computeDeltas(cur, prev);
    const climber = out.find((r) => r.modelName === "claude-opus")!;
    expect(climber.rankDelta).toEqual({ kind: "up", amount: 1 });
    // Movement claimed AND a real baseline existed → no violation.
    expect(
      auditItem([checkDeltaProvenance(claimsMovement(climber), true)]),
    ).toEqual([]);
  });

  it("an unchanged model reads `same`, not a zero-delta movement", () => {
    const prev = [row(1, "claude-opus", 1500)];
    const out = computeDeltas([row(1, "claude-opus", 1500)], prev);
    expect(out[0].rankDelta.kind).toBe("same");
    expect(claimsMovement(out[0])).toBe(false);
  });
});
