import { describe, it, expect } from "vitest";

import { isTotalFailure, isTotalSendFailure } from "../success-contract";

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

describe("isTotalSendFailure — the hollow-green case the base predicate cannot see", () => {
  it("recipients existed, nothing sent, chunks failed loudly → total failure", () => {
    expect(
      isTotalSendFailure({ sent: 0, failedChunks: 2, recipientCount: 5 }),
    ).toBe(true);
  });

  it("recipients existed, nothing sent, NO chunk reported failure (hollow run) → total failure", () => {
    // The S89-carried gap: a silent skip (all recipients filtered out, or
    // the chunk builder produced nothing) previously read as green.
    expect(
      isTotalSendFailure({ sent: 0, failedChunks: 0, recipientCount: 5 }),
    ).toBe(true);
  });

  it("zero recipients (early-life quiet) → NOT a failure", () => {
    expect(
      isTotalSendFailure({ sent: 0, failedChunks: 0, recipientCount: 0 }),
    ).toBe(false);
  });

  it("partial delivery with some failed chunks → NOT a failure (forward progress)", () => {
    expect(
      isTotalSendFailure({ sent: 3, failedChunks: 1, recipientCount: 5 }),
    ).toBe(false);
  });

  it("clean full delivery → NOT a failure", () => {
    expect(
      isTotalSendFailure({ sent: 5, failedChunks: 0, recipientCount: 5 }),
    ).toBe(false);
  });
});
