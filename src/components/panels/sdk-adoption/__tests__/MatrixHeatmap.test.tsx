import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MatrixHeatmap,
  MatrixLegend,
  cellClassFromDelta,
  visibleColumnDates,
  formatCellTooltip,
} from "@/components/panels/sdk-adoption/MatrixHeatmap";
import type { SdkAdoptionPackage } from "@/lib/data/sdk-adoption";

function row(
  id: string,
  days: Array<{ date: string; count: number | null; delta: number | null }>,
): SdkAdoptionPackage {
  return {
    id,
    label: id.split(":")[1] ?? id,
    registry: id.split(":")[0] as SdkAdoptionPackage["registry"],
    latest: { count: days[days.length - 1]?.count ?? null, fetchedAt: null },
    days,
    firstParty: true,
    caveat: null,
    counterName: "lastDay",
    counterUnits: "downloads/day",
  };
}

describe("cellClassFromDelta", () => {
  it("returns the null-cell class when delta is null", () => {
    expect(cellClassFromDelta(null)).toBe("cell-null");
  });

  it("returns a positive class for positive deltas", () => {
    expect(cellClassFromDelta(0.05)).toMatch(/^cell-pos/);
    expect(cellClassFromDelta(0.5)).toMatch(/^cell-pos/);
  });

  it("returns a negative class for negative deltas", () => {
    expect(cellClassFromDelta(-0.05)).toMatch(/^cell-neg/);
    expect(cellClassFromDelta(-0.5)).toMatch(/^cell-neg/);
  });

  it("returns the zero class for delta=0", () => {
    expect(cellClassFromDelta(0)).toBe("cell-zero");
  });

  it("scales magnitude into discrete bands (low/mid/high)", () => {
    expect(cellClassFromDelta(0.02)).toBe("cell-pos-low");
    expect(cellClassFromDelta(0.15)).toBe("cell-pos-mid");
    expect(cellClassFromDelta(0.6)).toBe("cell-pos-high");
    expect(cellClassFromDelta(-0.02)).toBe("cell-neg-low");
    expect(cellClassFromDelta(-0.15)).toBe("cell-neg-mid");
    expect(cellClassFromDelta(-0.6)).toBe("cell-neg-high");
  });
});

describe("visibleColumnDates", () => {
  it("returns all dates when viewport is wide", () => {
    const dates = ["d1", "d2", "d3"];
    expect(visibleColumnDates(dates, 1600)).toEqual(dates);
    expect(visibleColumnDates(dates, 1280)).toEqual(dates);
  });

  it("returns the trailing 14 dates when viewport is mid", () => {
    const dates = Array.from({ length: 30 }, (_, i) => `d${i}`);
    const out = visibleColumnDates(dates, 900);
    expect(out).toHaveLength(14);
    expect(out[0]).toBe("d16");
    expect(out[13]).toBe("d29");
  });

  it("returns [] when viewport is narrow (rows-only mode)", () => {
    const dates = Array.from({ length: 30 }, (_, i) => `d${i}`);
    expect(visibleColumnDates(dates, 600)).toEqual([]);
  });
});

describe("MatrixHeatmap render", () => {
  it("renders one tr per row", () => {
    const rows = [
      row("pypi:transformers", [{ date: "d1", count: 1, delta: 0.1 }]),
      row("npm:openai", [{ date: "d1", count: 5, delta: -0.1 }]),
    ];
    const html = renderToStaticMarkup(
      <MatrixHeatmap
        rows={rows}
        columnDates={["d1"]}
        viewportWidth={1600}
      />,
    );
    const trCount = (html.match(/<tr/g) ?? []).length;
    // 1 header tr + 2 data rows.
    expect(trCount).toBe(3);
  });

  it("applies the focused-row class when focusedRowId matches", () => {
    const rows = [row("pypi:transformers", [{ date: "d1", count: 1, delta: 0 }])];
    const html = renderToStaticMarkup(
      <MatrixHeatmap
        rows={rows}
        columnDates={["d1"]}
        viewportWidth={1600}
        focusedRowId="pypi:transformers"
      />,
    );
    expect(html).toContain("row-focused");
  });

  it("applies the stale-row class when row.latest.fetchedAt is missing or stale", () => {
    const stale = row("pypi:transformers", [{ date: "d1", count: 1, delta: 0 }]);
    stale.latest.fetchedAt = null;
    const html = renderToStaticMarkup(
      <MatrixHeatmap
        rows={[stale]}
        columnDates={["d1"]}
        viewportWidth={1600}
        nowMs={new Date("2026-04-25T12:00:00Z").getTime()}
      />,
    );
    expect(html).toContain("row-stale");
  });

  it("renders a grid role + row labels visible", () => {
    const rows = [row("pypi:transformers", [])];
    const html = renderToStaticMarkup(
      <MatrixHeatmap
        rows={rows}
        columnDates={[]}
        viewportWidth={1600}
      />,
    );
    expect(html).toContain('role="grid"');
    expect(html).toContain("transformers");
  });

  it("renders no data-cells when viewportWidth triggers rows-only mode", () => {
    const rows = [row("pypi:transformers", [{ date: "d1", count: 1, delta: 0.1 }])];
    const html = renderToStaticMarkup(
      <MatrixHeatmap
        rows={rows}
        columnDates={["d1"]}
        viewportWidth={500}
      />,
    );
    // The "rows-only" mode shows the latest delta as a chip but no
    // grid cells with data-date.
    expect(html).not.toContain('data-date="d1"');
  });

  it("falls back to empty-rows copy when rows is empty", () => {
    const html = renderToStaticMarkup(
      <MatrixHeatmap rows={[]} columnDates={[]} viewportWidth={1600} />,
    );
    expect(html).toMatch(/no.*rows/i);
  });

  it("composes a cell tooltip with pkgId · date · count · delta vs prior date", () => {
    const days = [
      { date: "2026-04-23", count: 4_000_000, delta: null },
      { date: "2026-04-24", count: 4_390_000, delta: 0.0975 },
      { date: "2026-04-25", count: 4_500_000, delta: 0.025 },
    ];
    const tip = formatCellTooltip("pypi:anthropic", days, "2026-04-24");
    expect(tip).toContain("pypi:anthropic");
    expect(tip).toContain("2026-04-24");
    expect(tip).toContain("4.4M");
    expect(tip).toContain("+10%");
    expect(tip).toContain("vs 2026-04-23");
  });

  it("falls back to 'baseline' for the first column where there's no prior", () => {
    const days = [{ date: "d1", count: 100, delta: null }];
    expect(formatCellTooltip("pypi:foo", days, "d1")).toContain("baseline");
  });

  it("falls back to 'no data' when the cell has null count", () => {
    const days = [{ date: "d1", count: null, delta: null }];
    expect(formatCellTooltip("pypi:foo", days, "d1")).toContain("no data");
  });
});

describe("MatrixLegend", () => {
  it("renders three colour samples and the 'declining/flat/growing' labels", () => {
    const html = renderToStaticMarkup(<MatrixLegend />);
    expect(html).toContain("legend-sample-neg");
    expect(html).toContain("legend-sample-flat");
    expect(html).toContain("legend-sample-pos");
    expect(html).toMatch(/declining/);
    expect(html).toMatch(/flat/);
    expect(html).toMatch(/growing/);
    expect(html).toContain('role="note"');
  });
});

describe("MatrixHeatmap render — extras", () => {
  function row(
    id: string,
    days: Array<{ date: string; count: number | null; delta: number | null }>,
  ): SdkAdoptionPackage {
    return {
      id,
      label: id.split(":")[1] ?? id,
      registry: id.split(":")[0] as SdkAdoptionPackage["registry"],
      latest: { count: days[days.length - 1]?.count ?? null, fetchedAt: null },
      days,
      firstParty: true,
      caveat: null,
      counterName: "lastDay",
      counterUnits: "downloads/day",
    };
  }

  it("includes data-date and data-pkg-id on each data cell for click handling (extras)", () => {
    const rows = [
      row("pypi:transformers", [{ date: "2026-04-25", count: 1, delta: 0.2 }]),
    ];
    const html = renderToStaticMarkup(
      <MatrixHeatmap
        rows={rows}
        columnDates={["2026-04-25"]}
        viewportWidth={1600}
      />,
    );
    expect(html).toContain('data-date="2026-04-25"');
    expect(html).toContain('data-pkg-id="pypi:transformers"');
  });
});
