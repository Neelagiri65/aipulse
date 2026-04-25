import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RowDrawer,
  composeShareHeadline,
  formatLatestStamp,
} from "@/components/panels/sdk-adoption/RowDrawer";
import type { SdkAdoptionPackage } from "@/lib/data/sdk-adoption";

vi.mock("@/lib/analytics", () => ({ track: () => {} }));

function pkg(overrides: Partial<SdkAdoptionPackage> = {}): SdkAdoptionPackage {
  return {
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
    caveat: "Counts via pypistats — third-party aggregator …",
    counterName: "lastDay",
    counterUnits: "downloads/day",
    ...overrides,
  };
}

describe("composeShareHeadline", () => {
  it("includes the package label, the most recent delta percentage, and the counter units", () => {
    const headline = composeShareHeadline(pkg());
    expect(headline).toMatch(/transformers/);
    expect(headline).toMatch(/20%/);
    expect(headline).toMatch(/downloads/);
  });

  it("returns a baseline-pending headline when delta is null", () => {
    const headline = composeShareHeadline(
      pkg({ days: [{ date: "d1", count: 1, delta: null }] }),
    );
    expect(headline).toMatch(/baseline/i);
  });
});

describe("RowDrawer render", () => {
  it("returns null when open=false", () => {
    const html = renderToStaticMarkup(
      <RowDrawer pkg={pkg()} open={false} onClose={() => {}} originUrl="https://aipulse.dev" />,
    );
    expect(html).toBe("");
  });

  it("renders the title with the registry chip and package label when open", () => {
    const html = renderToStaticMarkup(
      <RowDrawer pkg={pkg()} open={true} onClose={() => {}} originUrl="https://aipulse.dev" />,
    );
    expect(html).toContain("transformers");
    expect(html).toContain("pypi");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it("renders the latest count + fetchedAt stamp", () => {
    const html = renderToStaticMarkup(
      <RowDrawer pkg={pkg()} open={true} onClose={() => {}} originUrl="https://aipulse.dev" />,
    );
    expect(html).toContain("12,345");
    expect(html).toMatch(/2026-04-25/);
  });

  it("renders the third-party-aggregator caveat for pypi rows", () => {
    const html = renderToStaticMarkup(
      <RowDrawer pkg={pkg()} open={true} onClose={() => {}} originUrl="https://aipulse.dev" />,
    );
    expect(html).toMatch(/pypistats/i);
  });

  it("hides the caveat when caveat is null", () => {
    const html = renderToStaticMarkup(
      <RowDrawer
        pkg={pkg({ registry: "npm", caveat: null, firstParty: true })}
        open={true}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).not.toMatch(/pypistats/i);
  });

  it("renders the SparklineMini SVG inside the drawer", () => {
    const html = renderToStaticMarkup(
      <RowDrawer pkg={pkg()} open={true} onClose={() => {}} originUrl="https://aipulse.dev" />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
  });

  it("renders the share button with a deep-link to ?focus={pkgId}", () => {
    const html = renderToStaticMarkup(
      <RowDrawer pkg={pkg()} open={true} onClose={() => {}} originUrl="https://aipulse.dev" />,
    );
    // SectionShareButton emits a LinkedIn + X URL where the deep-link
    // is itself the value of a `url=` query param, so the inner
    // encoding double-escapes: `:` → `%3A` → `%253A`, `=` → `%3D`.
    expect(html).toMatch(/sdk-adoption%3Ffocus%3Dpypi%253Atransformers/);
  });

  it("renders an empty-history fallback when days have no non-null counts", () => {
    const empty = pkg({
      days: [
        { date: "d1", count: null, delta: null },
        { date: "d2", count: null, delta: null },
      ],
    });
    const html = renderToStaticMarkup(
      <RowDrawer pkg={empty} open={true} onClose={() => {}} originUrl="https://aipulse.dev" />,
    );
    expect(html).toMatch(/baseline.*today|collecting/i);
  });

  it("renders a first-party badge for first-party registries", () => {
    const html = renderToStaticMarkup(
      <RowDrawer
        pkg={pkg({ registry: "npm", firstParty: true, caveat: null })}
        open={true}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toMatch(/first-?party/i);
  });
});

describe("formatLatestStamp", () => {
  it("returns ISO date when fetchedAt present", () => {
    expect(formatLatestStamp("2026-04-25T04:00:00Z")).toMatch(/2026-04-25/);
  });

  it("returns 'never' when fetchedAt is null", () => {
    expect(formatLatestStamp(null)).toBe("never");
  });
});
