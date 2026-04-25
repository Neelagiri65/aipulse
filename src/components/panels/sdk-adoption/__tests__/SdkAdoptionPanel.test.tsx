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
  it("renders the matrix when data is present", () => {
    const html = renderToStaticMarkup(
      <SdkAdoptionPanel
        data={dto()}
        error={null}
        isInitialLoading={false}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toContain('role="grid"');
    expect(html).toContain("transformers");
    expect(html).toContain("openai");
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
});
