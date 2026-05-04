/**
 * Smoke tests for /admin/reports/[slug]/launch-check.
 *
 * Coverage:
 *  - Unauthorized request renders the UnauthorizedView (no leak of
 *    config / block data).
 *  - Authorized request with editorial-filled config + zero ops
 *    sanity warnings renders "READY".
 *  - Authorized request with sanity warnings renders the warnings
 *    AND surfaces "NOT READY".
 *  - Authorized request with editorial placeholders renders the
 *    per-field "EDITORIAL TBD" markers + NOT READY.
 *  - Unknown slug → notFound() (asserted via mocked notFound throw).
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EDITORIAL_PLACEHOLDER,
  type GenesisReportConfig,
} from "@/lib/reports/types";

// Auth seam — return null (pass) by default; per-test override to
// return a 401 Response.
vi.mock("@/lib/digest/admin-auth", () => ({
  requireAdminBasicAuth: vi.fn(() => null),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: () => "Basic Z2F3azpwYXNzd29yZA==",
  }),
}));

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

vi.mock("@/lib/reports/load-block", () => ({
  loadBlock: vi.fn(),
}));

function mkConfig(
  overrides: Partial<GenesisReportConfig> = {},
): GenesisReportConfig {
  return {
    slug: "test-report",
    title: "Test report",
    subtitle: "Subtitle",
    window: "April 2026",
    publishedAt: "DRAFT",
    hero: {
      stat: "Hero stat line",
      caption: "Hero caption",
      sourceUrl: "https://example.com",
      sourceLabel: "example",
    },
    thesis: "A real thesis paragraph.",
    sections: [
      {
        header: "Header 1",
        framing: "Framing 1",
        blockId: "sdk-adoption-gainers-30d",
      },
      {
        header: "Header 2",
        framing: "Framing 2",
        blockId: "openrouter-rank-climbers-30d",
      },
    ],
    ...overrides,
  };
}

async function loadPage() {
  const Mod = await import(
    "@/app/admin/reports/[slug]/launch-check/page"
  );
  return Mod.default;
}

describe("/admin/reports/[slug]/launch-check", () => {
  it("renders UnauthorizedView when auth fails (no config leak)", async () => {
    const auth = await import("@/lib/digest/admin-auth");
    vi.mocked(auth.requireAdminBasicAuth).mockReturnValue(
      new Response("nope", { status: 401 }),
    );
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(mkConfig());
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-report" }) }),
    );
    expect(html).toContain("Unauthorized");
    // Must not leak the config's title / hero / sections.
    expect(html).not.toContain("Test report");
    expect(html).not.toContain("Hero stat line");
  });

  it("returns notFound for an unknown slug (after auth passes)", async () => {
    const auth = await import("@/lib/digest/admin-auth");
    vi.mocked(auth.requireAdminBasicAuth).mockReturnValue(null);
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(null);
    const Page = await loadPage();
    await expect(
      Page({ params: Promise.resolve({ slug: "ghost" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders READY when editorial filled + every block has rows + zero ops warnings", async () => {
    const auth = await import("@/lib/digest/admin-auth");
    vi.mocked(auth.requireAdminBasicAuth).mockReturnValue(null);
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(mkConfig());
    const lb = await import("@/lib/reports/load-block");
    vi.mocked(lb.loadBlock).mockResolvedValue({
      rows: [
        {
          label: "row",
          value: "1k",
          sourceUrl: "https://x",
          sourceLabel: "x",
        },
      ],
      generatedAt: "2026-05-04T00:00:00.000Z",
      sanityWarnings: [],
    });
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-report" }) }),
    );
    expect(html).toContain("Launch-ready");
    expect(html).toContain("READY · safe to launch");
    expect(html).not.toContain("NOT READY");
  });

  it("surfaces ops sanity warnings + flags NOT READY when present (warnings hidden from public, visible here)", async () => {
    const auth = await import("@/lib/digest/admin-auth");
    vi.mocked(auth.requireAdminBasicAuth).mockReturnValue(null);
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(mkConfig());
    const lb = await import("@/lib/reports/load-block");
    vi.mocked(lb.loadBlock).mockResolvedValue({
      rows: [
        {
          label: "row",
          value: "1k",
          sourceUrl: "https://x",
          sourceLabel: "x",
        },
      ],
      generatedAt: "2026-05-04T00:00:00.000Z",
      sanityWarnings: [
        "ollama: -106.4% growth below the -90% sanity floor — excluded from display",
      ],
    });
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-report" }) }),
    );
    expect(html).toContain("NOT READY");
    expect(html).toContain("Not launch-ready");
    // The ops sanity warning IS surfaced here (unlike the public page
    // which hides them). This is the operator-facing surface.
    expect(html).toContain(
      "ollama: -106.4% growth below the -90% sanity floor",
    );
  });

  it("flags every editorial placeholder field individually + flags NOT READY", async () => {
    const auth = await import("@/lib/digest/admin-auth");
    vi.mocked(auth.requireAdminBasicAuth).mockReturnValue(null);
    const reg = await import("@/lib/reports/registry");
    vi.mocked(reg.getReportConfig).mockReturnValue(
      mkConfig({
        title: EDITORIAL_PLACEHOLDER,
        thesis: EDITORIAL_PLACEHOLDER,
      }),
    );
    const lb = await import("@/lib/reports/load-block");
    vi.mocked(lb.loadBlock).mockResolvedValue({
      rows: [
        {
          label: "row",
          value: "1k",
          sourceUrl: "https://x",
          sourceLabel: "x",
        },
      ],
      generatedAt: "2026-05-04T00:00:00.000Z",
      sanityWarnings: [],
    });
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "test-report" }) }),
    );
    expect(html).toContain("NOT READY");
    // Per-field markers visible.
    const tbdMatches = html.match(/EDITORIAL TBD/g);
    expect((tbdMatches?.length ?? 0)).toBeGreaterThanOrEqual(2);
  });
});
