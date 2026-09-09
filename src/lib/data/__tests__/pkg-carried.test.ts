/**
 * A failed package keeps its last-known number for the DISPLAY, and stays out
 * of the SERIES. The two halves want opposite answers, which is the whole
 * reason this exists.
 *
 * `writeLatest` used to be a plain overwrite, so a package that 429'd was
 * simply absent from the new blob and its previously-known counter was
 * destroyed. The daily snapshot then read a blob with no row for it and the
 * hole in the 30-day series was permanent. Measured on prod: PyPI held 10-21
 * of 30 days (pypi:anthropic's newest figure was nine days old) while npm,
 * crates, docker, brew and vscode — whose upstreams do not rate-limit — all
 * held 29 of 30.
 *
 * Carrying the value into the snapshot would have been the other error:
 * asserting a measurement that never happened, drawing a flat line where the
 * truth is a gap.
 */
import { describe, expect, it } from "vitest";

import { carryForwardFailed, type PackageLatest } from "@/lib/data/pkg-store";
import { summarisePackageLatest } from "@/lib/data/snapshot";

const previous: PackageLatest = {
  source: "pypi",
  fetchedAt: "2026-09-01T04:00:00.000Z",
  counters: { anthropic: { lastDay: 100 }, openai: { lastDay: 200 } },
  failures: [],
};

describe("carryForwardFailed", () => {
  it("keeps the last-known counter for a package that failed this run", () => {
    const merged = carryForwardFailed(
      {
        source: "pypi",
        fetchedAt: "2026-09-09T04:00:00.000Z",
        counters: { openai: { lastDay: 250 } },
        failures: [
          { pkg: "anthropic", message: "pypistats anthropic HTTP 429" },
        ],
      },
      previous,
    );

    // The number survives...
    expect(merged.counters.anthropic?.lastDay).toBe(100);
    // ...and says how old it really is, rather than borrowing today's stamp.
    expect(merged.carried?.anthropic).toBe("2026-09-01T04:00:00.000Z");
    // The package that succeeded is untouched and uncarried.
    expect(merged.counters.openai?.lastDay).toBe(250);
    expect(merged.carried?.openai).toBeUndefined();
  });

  it("does not resurrect a package that was deliberately dropped", () => {
    // A removed package is absent from BOTH counters and failures.
    const merged = carryForwardFailed(
      {
        source: "pypi",
        fetchedAt: "2026-09-09T04:00:00.000Z",
        counters: { openai: { lastDay: 250 } },
        failures: [],
      },
      previous,
    );

    expect(merged.counters.anthropic).toBeUndefined();
    expect(merged.carried).toBeUndefined();
  });

  it("does not reset the age when a package fails again", () => {
    const alreadyCarried: PackageLatest = {
      ...previous,
      fetchedAt: "2026-09-08T04:00:00.000Z",
      carried: { anthropic: "2026-09-01T04:00:00.000Z" },
    };
    const merged = carryForwardFailed(
      {
        source: "pypi",
        fetchedAt: "2026-09-09T04:00:00.000Z",
        counters: {},
        failures: [{ pkg: "anthropic", message: "HTTP 429" }],
      },
      alreadyCarried,
    );

    // Still dated to the real measurement, not to yesterday's carry.
    expect(merged.carried?.anthropic).toBe("2026-09-01T04:00:00.000Z");
  });
});

describe("summarisePackageLatest — the series stays honest", () => {
  it("omits a carried counter, leaving the day empty rather than flat", () => {
    const rows = summarisePackageLatest({
      source: "pypi",
      fetchedAt: "2026-09-09T04:00:00.000Z",
      counters: { anthropic: { lastDay: 100 }, openai: { lastDay: 250 } },
      failures: [{ pkg: "anthropic", message: "HTTP 429" }],
      carried: { anthropic: "2026-09-01T04:00:00.000Z" },
    });

    expect(rows.map((r) => r.name)).toEqual(["openai"]);
  });

  it("includes everything when nothing was carried", () => {
    const rows = summarisePackageLatest({
      source: "pypi",
      fetchedAt: "2026-09-09T04:00:00.000Z",
      counters: { anthropic: { lastDay: 100 }, openai: { lastDay: 250 } },
      failures: [],
    });

    expect(rows.map((r) => r.name)).toEqual(["anthropic", "openai"]);
  });
});
