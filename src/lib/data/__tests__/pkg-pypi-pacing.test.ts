/**
 * Pacing and 429 recovery for the pypistats ingest.
 *
 * Measured on prod before this existed: PyPI packages held 10-21 of 30 days in
 * the SDK Adoption series — pypi:anthropic's newest figure was nine days old —
 * while npm, crates, docker, brew and vscode all held 29 of 30. The difference
 * is that pypistats.org rate-limits and this ingest fired seven requests
 * back-to-back with no pause and no retry.
 *
 * Why a refusal is expensive rather than merely absent: a package that 429s is
 * not written, and `writeLatest` OVERWRITES the blob rather than merging, so
 * the package loses its last-known counter and is missing from the daily
 * snapshot that reads the blob afterwards. The gap in the 30-day series is
 * permanent.
 */
import { describe, expect, it, vi } from "vitest";

import { retryAfterMs, runPyPiIngest } from "@/lib/data/pkg-pypi";

vi.mock("@/lib/data/pkg-store", () => ({
  writeLatest: vi.fn(async () => undefined),
}));

function ok(count: number) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      data: { last_day: count, last_week: count * 7, last_month: count * 30 },
    }),
  } as unknown as Response;
}

function tooMany(retryAfter?: string) {
  return {
    ok: false,
    status: 429,
    headers: { get: (h: string) => (h === "retry-after" ? (retryAfter ?? null) : null) },
    json: async () => ({}),
  } as unknown as Response;
}

describe("pypi ingest — pacing", () => {
  it("waits between packages instead of bursting", async () => {
    const waits: number[] = [];
    const fetchImpl = vi.fn(async () => ok(10));

    const result = await runPyPiIngest({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      packages: ["a", "b", "c"],
      sleepImpl: async (ms) => {
        waits.push(ms);
      },
    });

    expect(result.written).toBe(3);
    // One pause between each pair, none before the first.
    expect(waits).toEqual([1500, 1500]);
  });

  it("retries a 429 once and keeps the package", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 1 ? tooMany() : ok(42);
    });

    const result = await runPyPiIngest({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      packages: ["anthropic"],
      sleepImpl: async () => {},
    });

    // Without the retry this package would be dropped from the blob — and
    // `writeLatest` overwriting means dropped is destroyed, not just missing.
    expect(result.failures).toEqual([]);
    expect(result.counters.anthropic?.lastDay).toBe(42);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry rather than hammering", async () => {
    const fetchImpl = vi.fn(async () => tooMany());

    const result = await runPyPiIngest({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      packages: ["anthropic"],
      sleepImpl: async () => {},
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.failures[0]?.message).toContain("429");
  });

  it("honours Retry-After, and refuses to be stalled by it", () => {
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs(null)).toBe(1500);
    expect(retryAfterMs("garbage")).toBe(1500);
    // A hostile header must not park the cron for an hour.
    expect(retryAfterMs("3600")).toBe(10_000);
  });
});
