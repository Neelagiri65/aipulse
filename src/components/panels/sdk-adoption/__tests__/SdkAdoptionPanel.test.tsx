import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SdkAdoptionPanel } from "@/components/panels/sdk-adoption/SdkAdoptionPanel";
import type { SdkAdoptionDto } from "@/lib/data/sdk-adoption";

vi.mock("@/lib/analytics", () => ({ track: () => {} }));

function dto(): SdkAdoptionDto {
  return {
    generatedAt: "2026-04-25T12:00:00Z",
    packages: [
      {
        id: "pypi:transformers",
        label: "transformers",
        registry: "pypi",
        latest: { count: 12345, fetchedAt: "2026-04-25T04:00:00Z" },
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
        latest: { count: 500, fetchedAt: "2026-04-25T04:00:00Z" },
        days: [{ date: "2026-04-25", count: 500, delta: null }],
        firstParty: true,
        caveat: null,
        counterName: "lastDay",
        counterUnits: "downloads/day",
      },
    ],
  };
}

describe("SdkAdoptionPanel", () => {
  it("defaults to the SparklineListView when data is present", () => {
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={dto()}
        error={null}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
      />,
    );
    // List view emits "Tracking since {date}" and registry section
    // headers; matrix view emits role=grid. The default is list.
    expect(html).toMatch(/Tracking since/);
    expect(html).not.toContain('role="grid"');
    expect(html).toContain("transformers");
    expect(html).toContain("openai");
  });

  it("renders the matrix when initialViewMode='heatmap' is set", () => {
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={dto()}
        error={null}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
        initialViewMode="heatmap"
      />,
    );
    expect(html).toContain('role="grid"');
  });

  it("renders both view-toggle buttons regardless of mode", () => {
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={dto()}
        error={null}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toMatch(/aria-pressed="true"[^>]*>List/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Heatmap/);
  });

  it("renders loading state when isInitialLoading and no data", () => {
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={null}
        error={null}
        isInitialLoading={true}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toMatch(/loading|baseline|—/i);
    expect(html).not.toContain('role="grid"');
  });

  it("renders error fallback when error is present and no data", () => {
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={null}
        error={new Error("upstream 500")}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toMatch(/couldn.?t load|try again/i);
  });

  it("renders pre-baseline empty copy when packages is empty", () => {
    const empty: SdkAdoptionDto = { packages: [], generatedAt: "now" };
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={empty}
        error={null}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toMatch(/baseline|collecting|no rows/i);
  });

  it("opens the drawer on mount when initialFocusedRowId is provided", () => {
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={dto()}
        error={null}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
        initialFocusedRowId="pypi:transformers"
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("aria-modal=\"true\"");
  });

  it("does not render the drawer when initialFocusedRowId is missing", () => {
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={dto()}
        error={null}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).not.toContain('role="dialog"');
  });

  it("ignores an initialFocusedRowId that doesn't match any package row", () => {
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={dto()}
        error={null}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
        initialFocusedRowId="pypi:nonexistent"
      />,
    );
    expect(html).not.toContain('role="dialog"');
  });

  it("error fallback renders a Retry button with an aria-label", () => {
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={null}
        error={"upstream 500"}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toContain('aria-label="Retry loading SDK adoption data"');
    expect(html).toMatch(/Retry now/);
  });

  it("empty-state copy mentions the 30-day baseline window explicitly", () => {
    const empty: SdkAdoptionDto = { packages: [], generatedAt: "now" };
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={empty}
        error={null}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toMatch(/30 days/i);
  });

  it("propagates the stale row class from MatrixHeatmap to the rendered output", () => {
    const stale: SdkAdoptionDto = {
      generatedAt: "now",
      packages: [
        {
          id: "pypi:transformers",
          label: "transformers",
          registry: "pypi",
          // fetchedAt missing → MatrixHeatmap will mark the row stale.
          latest: { count: 1, fetchedAt: null },
          days: [{ date: "2026-04-25", count: 1, delta: null }],
          firstParty: false,
          caveat: null,
          counterName: "lastDay",
          counterUnits: "downloads/day",
        },
      ],
    };
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={stale}
        error={null}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toContain("row-stale");
  });
});
