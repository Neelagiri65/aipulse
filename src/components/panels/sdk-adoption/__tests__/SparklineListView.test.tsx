import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SparklineListView,
  formatCount,
  deltaClass,
} from "@/components/panels/sdk-adoption/SparklineListView";
import type { SdkAdoptionDto } from "@/lib/data/sdk-adoption";

function dto(): SdkAdoptionDto {
  return {
    generatedAt: "2026-04-25T12:00:00Z",
    packages: [
      {
        id: "pypi:transformers",
        label: "transformers",
        registry: "pypi",
        latest: { count: 12_345_678, fetchedAt: "2026-04-25T04:00:00Z" },
        days: [
          { date: "2026-04-23", count: 100, delta: null },
          { date: "2026-04-24", count: 110, delta: 0.1 },
          { date: "2026-04-25", count: 130, delta: 0.2 },
        ],
        firstParty: false,
        caveat: "pypistats caveat",
        counterName: "lastDay",
        counterUnits: "downloads/day",
      },
      {
        id: "npm:openai",
        label: "openai",
        registry: "npm",
        latest: { count: 500_000, fetchedAt: "2026-04-25T04:00:00Z" },
        days: [
          { date: "2026-04-23", count: null, delta: null },
          { date: "2026-04-24", count: 480_000, delta: null },
          { date: "2026-04-25", count: 500_000, delta: null },
        ],
        firstParty: true,
        caveat: null,
        counterName: "lastDay",
        counterUnits: "downloads/day",
      },
      {
        id: "brew:ollama",
        label: "ollama",
        registry: "brew",
        latest: { count: 2304, fetchedAt: "2026-04-25T04:00:00Z" },
        days: [
          { date: "2026-04-23", count: 1500, delta: null },
          { date: "2026-04-24", count: 2000, delta: null },
          { date: "2026-04-25", count: 2304, delta: null },
        ],
        firstParty: true,
        caveat: null,
        counterName: "lastMonth diff",
        counterUnits: "30d-cumulative installs Δ",
      },
    ],
  };
}

describe("formatCount", () => {
  it("formats millions with M suffix and 1dp", () => {
    expect(formatCount(12_345_678)).toMatch(/12\.[0-9]M/);
  });

  it("formats thousands with k suffix and 1dp", () => {
    expect(formatCount(2304)).toMatch(/2\.[0-9]k/);
  });

  it("returns the raw integer for sub-thousand counts", () => {
    expect(formatCount(42)).toBe("42");
  });

  it("returns em-dash for null", () => {
    expect(formatCount(null)).toBe("—");
  });
});

describe("deltaClass", () => {
  it("returns the positive class for positive deltas above the noise floor", () => {
    expect(deltaClass(0.1)).toBe("delta-pos");
    expect(deltaClass(0.6)).toBe("delta-pos");
  });

  it("returns the negative class for negative deltas above the noise floor", () => {
    expect(deltaClass(-0.1)).toBe("delta-neg");
  });

  it("returns the flat class within ±2% (noise floor)", () => {
    expect(deltaClass(0.01)).toBe("delta-flat");
    expect(deltaClass(-0.01)).toBe("delta-flat");
    expect(deltaClass(0)).toBe("delta-flat");
  });

  it("returns the null class when delta is null", () => {
    expect(deltaClass(null)).toBe("delta-null");
  });
});

describe("SparklineListView render", () => {
  it("renders a registry section header per non-empty registry", () => {
    const html = renderToStaticMarkup(
      <SparklineListView data={dto()} originUrl="https://gawk.dev" />,
    );
    expect(html).toMatch(/PyPI/);
    expect(html).toMatch(/npm/);
    expect(html).toMatch(/Homebrew/);
  });

  it("renders one row per package with label, formatted latest count, sparkline svg, and coverage", () => {
    const html = renderToStaticMarkup(
      <SparklineListView data={dto()} originUrl="https://gawk.dev" />,
    );
    expect(html).toContain("transformers");
    expect(html).toMatch(/12\.[0-9]M/);
    expect(html).toContain("<svg");
    // Coverage = filled/total: every row in the fixture has 3 days, with
    // varying nulls. Format is "N/3".
    expect(html).toMatch(/\d\/3/);
  });

  it("renders a 'Tracking since' label tied to the earliest data date in the DTO", () => {
    const html = renderToStaticMarkup(
      <SparklineListView data={dto()} originUrl="https://gawk.dev" />,
    );
    expect(html).toMatch(/Tracking since/i);
    expect(html).toMatch(/2026-04-23/);
  });

  it("renders a baseline-empty fallback when no row has any data", () => {
    const empty = {
      generatedAt: "now",
      packages: [
        {
          id: "pypi:a",
          label: "a",
          registry: "pypi" as const,
          latest: { count: null, fetchedAt: null },
          days: [
            { date: "d1", count: null, delta: null },
            { date: "d2", count: null, delta: null },
          ],
          firstParty: false,
          caveat: null,
          counterName: "lastDay",
          counterUnits: "downloads/day",
        },
      ],
    };
    const html = renderToStaticMarkup(
      <SparklineListView data={empty} originUrl="https://gawk.dev" />,
    );
    expect(html).toMatch(/baseline|collecting/i);
  });

  it("respects a focused row id by setting the row-focused class", () => {
    const html = renderToStaticMarkup(
      <SparklineListView
        data={dto()}
        originUrl="https://gawk.dev"
        focusedRowId="pypi:transformers"
      />,
    );
    expect(html).toContain("row-focused");
  });

  it("renders data-pkg-id on each row so a delegated click handler can route", () => {
    const html = renderToStaticMarkup(
      <SparklineListView data={dto()} originUrl="https://gawk.dev" />,
    );
    expect(html).toContain('data-pkg-id="pypi:transformers"');
    expect(html).toContain('data-pkg-id="npm:openai"');
    expect(html).toContain('data-pkg-id="brew:ollama"');
  });
});
