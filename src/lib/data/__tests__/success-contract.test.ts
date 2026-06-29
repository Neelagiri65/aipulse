import { describe, it, expect } from "vitest";

import { isTotalFailure } from "../success-contract";

describe("isTotalFailure — the unified cron success contract", () => {
  it("attempted work, delivered nothing → total failure (ok:false)", () => {
    expect(isTotalFailure({ delivered: 0, failures: 3 })).toBe(true);
    expect(isTotalFailure({ delivered: 0, failures: 1 })).toBe(true);
  });

  it("nothing to do (no failures, nothing delivered) → NOT a failure (ok:true)", () => {
    // 0 subscribers, an empty feed, a paused source — green with 0 items.
    expect(isTotalFailure({ delivered: 0, failures: 0 })).toBe(false);
  });

  it("forward progress with some failures → NOT a failure (partial success)", () => {
    // 25 cards written + one subreddit 429; 5 push sent + 1 stale endpoint.
    expect(isTotalFailure({ delivered: 5, failures: 1 })).toBe(false);
    expect(isTotalFailure({ delivered: 1, failures: 9 })).toBe(false);
  });

  it("everything delivered, nothing failed → NOT a failure", () => {
    expect(isTotalFailure({ delivered: 7, failures: 0 })).toBe(false);
  });
});
