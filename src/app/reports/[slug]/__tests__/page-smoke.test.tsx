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

// Stub loadBlock — tests at this layer assert layout + editorial
// guards. Block-internal logic is covered by per-block unit tests
// under src/lib/reports/blocks/__tests__/.
vi.mock("@/lib/reports/load-block", () => ({
  loadBlock: vi.fn(async (blockId: string) => ({
    rows: [
      {
        label: `mock-row-${blockId}`,
        value: "1.2k",
        delta: "+50% 30d",
        sourceUrl: "https://example.com/source",
        sourceLabel: "example.com",
      },
    ],
    generatedAt: "2026-05-04T00:00:00.000Z",
    sanityWarnings: [],
  })),
}));

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
    expect(html).toContain('data-testid="report-block-sdk-adoption-gainers-30d"');
    // Mocked loadBlock returns one row per block; verify the row label
    // and the source link both render.
    expect(html).toContain("mock-row-sdk-adoption-gainers-30d");
    expect(html).toContain("example.com");
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

  it("hoists a shared caveat to once-per-section when every row carries the same string (no per-row repetition)", async () => {
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(mkConfig());
    const lb = await import("@/lib/reports/load-block");
    const sharedCaveat = "OpenRouter request volume reflects developer API spending.";
    vi.mocked(lb.loadBlock).mockResolvedValue({
      rows: [
        {
          label: "row-1",
          value: "rank 1",
          sourceUrl: "https://x/1",
          sourceLabel: "x",
          caveat: sharedCaveat,
        },
        {
          label: "row-2",
          value: "rank 2",
          sourceUrl: "https://x/2",
          sourceLabel: "x",
          caveat: sharedCaveat,
        },
        {
          label: "row-3",
          value: "rank 3",
          sourceUrl: "https://x/3",
          sourceLabel: "x",
          caveat: sharedCaveat,
        },
      ],
      generatedAt: "2026-05-04T00:00:00.000Z",
      sanityWarnings: [],
    });
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-slug" }) }),
    );
    // Caveat appears EXACTLY ONCE per section it covers (not once per
    // row), and the dedicated section-level testid is present.
    const matches = html.match(
      /OpenRouter request volume reflects developer API spending/g,
    );
    // The fixture has 2 sections both calling loadBlock with the same
    // mock → caveat hoisted in each. So we expect exactly 2 occurrences
    // (not 6 = 3 rows × 2 sections).
    expect(matches?.length ?? 0).toBe(2);
    expect(html).toMatch(/data-testid="report-block-caveat-/);
  });

  it("keeps per-row caveat when caveats differ across rows", async () => {
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(mkConfig());
    const lb = await import("@/lib/reports/load-block");
    vi.mocked(lb.loadBlock).mockResolvedValue({
      rows: [
        {
          label: "row-pypi",
          value: "1k",
          sourceUrl: "https://x/1",
          sourceLabel: "x",
          caveat: "PyPI caveat",
        },
        {
          label: "row-npm",
          value: "2k",
          sourceUrl: "https://x/2",
          sourceLabel: "x",
          caveat: "npm caveat",
        },
      ],
      generatedAt: "2026-05-04T00:00:00.000Z",
      sanityWarnings: [],
    });
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-slug" }) }),
    );
    // Both per-row caveats render, no shared-caveat hoist.
    expect(html).toContain("PyPI caveat");
    expect(html).toContain("npm caveat");
    expect(html).not.toMatch(/data-testid="report-block-caveat-/);
  });

  it("does NOT render ops-only sanityWarnings on the public page (S62g)", async () => {
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(mkConfig());
    const lb = await import("@/lib/reports/load-block");
    vi.mocked(lb.loadBlock).mockResolvedValue({
      rows: [],
      generatedAt: "2026-05-04T00:00:00.000Z",
      sanityWarnings: [
        "ollama: -106.4% growth below the -90% sanity floor — excluded from display",
      ],
    });
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-slug" }) }),
    );
    // Reader must NEVER see the ops disclosure language.
    expect(html).not.toContain("DATA NEEDS REVIEW");
    expect(html).not.toContain("data needs review");
    expect(html).not.toContain("excluded from display");
    expect(html).not.toContain("sanity floor");
    expect(html).not.toContain("ollama:");
    // Honest empty placeholder still surfaces when rows.length === 0.
    expect(html).toContain("[no qualifying rows for this window");
  });

  it("renders reader-facing caveats[] as plain inline notes (no header label)", async () => {
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(mkConfig());
    const lb = await import("@/lib/reports/load-block");
    vi.mocked(lb.loadBlock).mockResolvedValue({
      rows: [
        {
          label: "openai-api",
          value: "7 incident-days",
          sourceUrl: "https://status.openai.com",
          sourceLabel: "status.openai.com",
        },
      ],
      generatedAt: "2026-05-04T00:00:00.000Z",
      sanityWarnings: [],
      caveats: [
        "Based on 12 days of captured snapshots — represents a minimum, not a complete count.",
      ],
    });
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-slug" }) }),
    );
    // The caveat text renders, but with no "data needs review" label.
    expect(html).toContain(
      "Based on 12 days of captured snapshots — represents a minimum, not a complete count",
    );
    expect(html).not.toContain("data needs review");
    expect(html).not.toContain("DATA NEEDS REVIEW");
    expect(html).toContain('data-testid="report-block-note-');
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
