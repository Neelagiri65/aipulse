import { describe, expect, it } from "vitest";
import {
  loadOpenRouterClimbers30dBlock,
  loadOpenRouterFallers30dBlock,
  __test__,
} from "@/lib/reports/blocks/openrouter-rank-movers";
import { OPENROUTER_SOURCE_CAVEAT } from "@/lib/data/openrouter-types";

const FIXED_NOW = () => new Date("2026-05-04T00:00:00.000Z");

function snap(date: string, slugs: string[]) {
  return { date, ordering: "top-weekly" as const, slugs };
}

describe("__test__.computeRankMoves", () => {
  it("computes positive deltas for slugs that improved rank", () => {
    const moves = __test__.computeRankMoves(
      snap("2026-05-04", ["a", "b", "c", "d"]),
      snap("2026-04-04", ["b", "a", "c", "d"]),
    );
    const a = moves.find((m) => m.slug === "a")!;
    expect(a.oldRank).toBe(2);
    expect(a.newRank).toBe(1);
    expect(a.rankDelta).toBe(1);
  });

  it("excludes new entrants (only in newSnap)", () => {
    const moves = __test__.computeRankMoves(
      snap("2026-05-04", ["a", "newcomer", "b"]),
      snap("2026-04-04", ["a", "b"]),
    );
    expect(moves.find((m) => m.slug === "newcomer")).toBeUndefined();
  });

  it("excludes drop-outs (only in oldSnap)", () => {
    const moves = __test__.computeRankMoves(
      snap("2026-05-04", ["a", "b"]),
      snap("2026-04-04", ["a", "fell-off", "b"]),
    );
    expect(moves.find((m) => m.slug === "fell-off")).toBeUndefined();
  });
});

describe("__test__.pickWindowEdges", () => {
  it("returns null when fewer than 2 snapshots exist", () => {
    expect(
      __test__.pickWindowEdges(
        { "2026-05-04": snap("2026-05-04", []) },
        30,
        Date.UTC(2026, 4, 4),
      ),
    ).toBeNull();
  });

  it("picks newest as newSnap and oldest snapshot ≤ window+grace as oldSnap", () => {
    const dict = {
      "2026-04-01": snap("2026-04-01", ["a"]),
      "2026-04-15": snap("2026-04-15", ["a"]),
      "2026-05-04": snap("2026-05-04", ["a"]),
    };
    const edges = __test__.pickWindowEdges(dict, 30, Date.UTC(2026, 4, 4));
    expect(edges).not.toBeNull();
    expect(edges!.newSnap.date).toBe("2026-05-04");
    // Cutoff = 2026-05-04 - 37d = 2026-03-28. Earliest snap ≥ that = 2026-04-01.
    expect(edges!.oldSnap.date).toBe("2026-04-01");
  });

  it("falls back to the oldest available when window is wider than history", () => {
    const dict = {
      "2026-05-01": snap("2026-05-01", ["a"]),
      "2026-05-04": snap("2026-05-04", ["a"]),
    };
    const edges = __test__.pickWindowEdges(dict, 30, Date.UTC(2026, 4, 4));
    expect(edges).not.toBeNull();
    expect(edges!.oldSnap.date).toBe("2026-05-01");
  });

  it("returns null when newest = oldest after edge selection (only one distinct date)", () => {
    const dict = { "2026-05-04": snap("2026-05-04", ["a"]) };
    expect(__test__.pickWindowEdges(dict, 30, Date.UTC(2026, 4, 4))).toBeNull();
  });
});

describe("loadOpenRouterClimbers30dBlock", () => {
  it("returns top-N climbers (positive rankDelta only), sorted by biggest jump", () => {
    const dict = {
      "2026-04-04": snap("2026-04-04", ["w", "x", "y", "z", "a"]),
      "2026-05-04": snap("2026-05-04", ["a", "y", "x", "z", "w"]),
    };
    const result = loadOpenRouterClimbers30dBlock({
      snapshots: dict,
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label)).toEqual(["a", "y"]);
    // a climbed from rank 5 → 1 = delta +4. y climbed from 3 → 2 = +1.
    expect(result.rows[0].delta).toContain("4");
    expect(result.rows[1].delta).toContain("1");
  });

  it("formats rows with the canonical OpenRouter model URL + verbatim caveat", () => {
    const dict = {
      "2026-04-04": snap("2026-04-04", ["x", "anthropic/claude-3.5-sonnet"]),
      "2026-05-04": snap("2026-05-04", ["anthropic/claude-3.5-sonnet", "x"]),
    };
    const result = loadOpenRouterClimbers30dBlock({
      snapshots: dict,
      now: FIXED_NOW,
    });
    const row = result.rows.find((r) => r.label === "anthropic/claude-3.5-sonnet")!;
    expect(row.sourceUrl).toBe(
      "https://openrouter.ai/anthropic/claude-3.5-sonnet",
    );
    expect(row.sourceLabel).toBe("OpenRouter rankings");
    expect(row.caveat).toBe(OPENROUTER_SOURCE_CAVEAT);
  });

  it("renders rank-1 vs rank-N+ delta with singular/plural unit correctly", () => {
    const dict = {
      "2026-04-04": snap("2026-04-04", ["a", "b"]),
      "2026-05-04": snap("2026-05-04", ["b", "a"]),
    };
    const result = loadOpenRouterClimbers30dBlock({
      snapshots: dict,
      now: FIXED_NOW,
    });
    expect(result.rows[0].delta).toMatch(/↑\s+1\s+rank$/);
  });

  it("returns honest empty + sanity warning when bootstrap window has only one snapshot", () => {
    const result = loadOpenRouterClimbers30dBlock({
      snapshots: { "2026-05-04": snap("2026-05-04", ["a", "b"]) },
      now: FIXED_NOW,
    });
    expect(result.rows).toEqual([]);
    expect(result.sanityWarnings.length).toBeGreaterThanOrEqual(1);
    expect(result.sanityWarnings[0]).toContain("snapshot history insufficient");
  });
});

describe("loadOpenRouterFallers30dBlock", () => {
  it("returns top-N fallers (negative rankDelta only), sorted by biggest fall", () => {
    const dict = {
      "2026-04-04": snap("2026-04-04", ["a", "b", "c", "d", "e"]),
      "2026-05-04": snap("2026-05-04", ["b", "c", "d", "e", "a"]),
    };
    const result = loadOpenRouterFallers30dBlock({
      snapshots: dict,
      now: FIXED_NOW,
    });
    // a fell from rank 1 → 5 = delta -4. b/c/d went up by 1 each (excluded).
    expect(result.rows.map((r) => r.label)).toEqual(["a"]);
    expect(result.rows[0].delta).toContain("↓");
    expect(result.rows[0].delta).toContain("4");
  });

  it("excludes climbers entirely from the fallers block (and vice versa)", () => {
    const dict = {
      "2026-04-04": snap("2026-04-04", ["a", "b", "c"]),
      "2026-05-04": snap("2026-05-04", ["c", "a", "b"]),
    };
    const fallers = loadOpenRouterFallers30dBlock({
      snapshots: dict,
      now: FIXED_NOW,
    });
    const climbers = loadOpenRouterClimbers30dBlock({
      snapshots: dict,
      now: FIXED_NOW,
    });
    // c climbed from 3 → 1 (climber). a fell 1 → 2, b fell 2 → 3 (fallers).
    expect(climbers.rows.map((r) => r.label)).toEqual(["c"]);
    expect(fallers.rows.map((r) => r.label).sort()).toEqual(["a", "b"]);
  });

  it("returns honest empty when no slug fell rank", () => {
    const dict = {
      "2026-04-04": snap("2026-04-04", ["a", "b", "c"]),
      "2026-05-04": snap("2026-05-04", ["a", "b", "c"]),
    };
    const result = loadOpenRouterFallers30dBlock({
      snapshots: dict,
      now: FIXED_NOW,
    });
    expect(result.rows).toEqual([]);
    expect(result.sanityWarnings).toEqual([]);
  });
});
