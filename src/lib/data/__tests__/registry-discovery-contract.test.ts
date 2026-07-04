import { describe, expect, it } from "vitest";

import { isDiscoverTotalFailure } from "@/lib/data/registry-discovery";

/**
 * Unified-success-contract verdicts for the discovery sweep, pinned to the
 * 2026-07-04 GH_TOKEN outage: every search kind 401'd, zero candidates,
 * and the run reported ok:true. The contract: fail only when the run
 * attempted work and delivered NOTHING; quiet sweeps and single flaky
 * kinds stay green (no cry-wolf — the S89 reddit lesson).
 */
describe("isDiscoverTotalFailure", () => {
  const fail = (step: string) => ({ step, message: "returned 401" });

  it("dead token: all kinds fail, zero candidates → TOTAL FAILURE (the 2026-07-04 incident)", () => {
    expect(
      isDiscoverTotalFailure({
        searchesCompleted: 0,
        candidatesFound: 0,
        failures: [
          fail("search:claude-md"),
          fail("search:agents-md"),
          fail("search:cursorrules"),
          fail("search:windsurfrules"),
          fail("search:aider"),
          fail("search:codex"),
        ],
      }),
    ).toBe(true);
  });

  it("quiet sweep: all kinds clean, zero candidates → green (nothing-to-do)", () => {
    expect(
      isDiscoverTotalFailure({
        searchesCompleted: 6,
        candidatesFound: 0,
        failures: [],
      }),
    ).toBe(false);
  });

  it("one flaky kind, others clean with zero new candidates → green (no cry-wolf)", () => {
    expect(
      isDiscoverTotalFailure({
        searchesCompleted: 5,
        candidatesFound: 0,
        failures: [fail("search:claude-md")],
      }),
    ).toBe(false);
  });

  it("page-2 failure after page-1 delivered candidates → green (partial success)", () => {
    expect(
      isDiscoverTotalFailure({
        searchesCompleted: 0,
        candidatesFound: 25,
        failures: [
          fail("search:claude-md"),
          fail("search:agents-md"),
          fail("search:cursorrules"),
          fail("search:windsurfrules"),
          fail("search:aider"),
          fail("search:codex"),
        ],
      }),
    ).toBe(false);
  });

  it("pre-flight abort (no token / no redis): zero completed, one failure → TOTAL FAILURE", () => {
    expect(
      isDiscoverTotalFailure({
        searchesCompleted: 0,
        candidatesFound: 0,
        failures: [fail("auth")],
      }),
    ).toBe(true);
  });
});
