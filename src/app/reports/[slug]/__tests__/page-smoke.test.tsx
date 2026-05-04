/**
 * Smoke test for /reports/[slug]. The route is server-rendered,
 * tests use renderToStaticMarkup against the public default export.
 *
 * Coverage:
 *  - Known slug renders header + every section + subscribe CTA
 *    + methodology footer.
 *  - Unknown slug → notFound() (asserted via mocked notFound throwing).
 *  - Editorial placeholders surface visible "[ ... pending]" tags
 *    + a draft banner; engine NEVER falls back to fabricated prose.
 *  - Editorial-filled config does NOT surface the draft banner.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EDITORIAL_PLACEHOLDER,
  type GenesisReportConfig,
} from "@/lib/reports/types";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/reports/registry", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/reports/registry")
  >("@/lib/reports/registry");
  return { ...actual, getReportConfig: vi.fn() };
});

function mkConfig(
  overrides: Partial<GenesisReportConfig> = {},
): GenesisReportConfig {
  return {
    slug: "test-slug",
    title: "April 2026 in AI tooling",
    subtitle: "Who's gaining, who's losing.",
    window: "April 2026",
    publishedAt: "2026-05-04",
    hero: {
      stat: "184% w/w",
      caption: "torch downloads, week 4 of decline",
      sourceUrl: "https://pypistats.org/packages/torch",
      sourceLabel: "pypistats.org",
    },
    thesis: "Open-weight inference is winning the adoption race.",
    sections: [
      {
        header: "Gainers",
        framing: "Three packages doubled their weekly downloads.",
        blockId: "sdk-adoption-gainers-30d",
      },
      {
        header: "Losers",
        framing: "Three packages lost a third of their developer base.",
        blockId: "sdk-adoption-losers-30d",
      },
    ],
    ...overrides,
  };
}

async function loadPage() {
  const Mod = await import("@/app/reports/[slug]/page");
  return Mod.default;
}

describe("/reports/[slug]", () => {
  it("renders the header, every section, and the subscribe CTA + methodology footer", async () => {
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(mkConfig());
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-slug" }) }),
    );
    expect(html).toContain("April 2026 in AI tooling");
    expect(html).toContain("Who&#x27;s gaining, who&#x27;s losing.");
    expect(html).toContain("184% w/w");
    expect(html).toContain("torch downloads, week 4 of decline");
    expect(html).toContain("pypistats.org");
    expect(html).toContain("Open-weight inference is winning the adoption race.");
    expect(html).toContain("Gainers");
    expect(html).toContain("Losers");
    expect(html).toContain('data-testid="report-section-sdk-adoption-gainers-30d"');
    expect(html).toContain('data-testid="report-section-sdk-adoption-losers-30d"');
    expect(html).toContain('data-testid="report-block-placeholder-sdk-adoption-gainers-30d"');
    expect(html).toContain('data-testid="report-subscribe-cta"');
    expect(html).toContain("Subscribe to the daily digest");
    expect(html).toContain("Sources");
    expect(html).toContain("Methodology");
  });

  it("returns notFound for an unknown slug", async () => {
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(null);
    const Page = await loadPage();
    await expect(
      Page({ params: Promise.resolve({ slug: "ghost" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("surfaces the DRAFT banner + inline 'pending' tags when ANY editorial field is the placeholder", async () => {
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(
      mkConfig({ thesis: EDITORIAL_PLACEHOLDER }),
    );
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-slug" }) }),
    );
    expect(html).toContain('data-testid="report-editorial-pending"');
    expect(html).toContain("DRAFT");
    expect(html).toContain("editorial copy not yet filled");
    expect(html).toContain("[thesis paragraph pending");
  });

  it("does NOT surface the DRAFT banner when all editorial fields are filled", async () => {
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(mkConfig());
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-slug" }) }),
    );
    expect(html).not.toContain('data-testid="report-editorial-pending"');
  });

  it("falls back to engine-safe placeholder text per field when only that field is the placeholder (no fabricated prose)", async () => {
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(
      mkConfig({
        sections: [
          {
            header: EDITORIAL_PLACEHOLDER,
            framing: EDITORIAL_PLACEHOLDER,
            blockId: "sdk-adoption-gainers-30d",
          },
          {
            header: "Real header",
            framing: "Real framing",
            blockId: "sdk-adoption-losers-30d",
          },
        ],
      }),
    );
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-slug" }) }),
    );
    // Pending tags surface inline for the unfilled section.
    expect(html).toContain("[section header pending");
    expect(html).toContain("[section framing pending");
    // The filled section renders verbatim.
    expect(html).toContain("Real header");
    expect(html).toContain("Real framing");
  });
});
