/**
 * The report's unfurl card must come from the route, not from a file.
 *
 * S62g.4 pinned `og:image` to a hand-rendered `/public/og/{slug}.png` because
 * the dynamic route was returning Next's error-page HTML under an image/png
 * header. The workaround outlived its cause and froze the card: baked
 * 2026-05-06, that PNG still showed the pre-rename identity — dark #06080a,
 * the teal AI Pulse pulse-dot, a wordmark reading "G A W K" — for four months
 * after #155–#157 moved the site to warm paper, and through the rename that
 * made "gawk.dev" the only spelling.
 *
 * The rule this pins: leave `openGraph.images` UNSET so Next routes the card
 * to the colocated `opengraph-image.tsx`. Setting it to a static path is how
 * the identity desynchronises from the site again, silently, because a PNG
 * cannot follow a redesign.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { generateMetadata } from "@/app/reports/[slug]/page";
import { listReportSlugs } from "@/lib/reports/registry";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("report metadata — og:image comes from opengraph-image.tsx", () => {
  it("does not pin a static /og/*.png for any registered report", async () => {
    const slugs = listReportSlugs();
    // An empty registry would make the loop below assert nothing at all.
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const meta = await generateMetadata(params(slug));
      const serialised = JSON.stringify(meta.openGraph ?? {});
      // The exact regression: a hand-rendered file frozen at its bake date.
      expect(serialised).not.toContain("/og/");
      expect(meta.openGraph?.images).toBeUndefined();
    }
  });

  it("still carries the article metadata the LinkedIn unfurl needs", async () => {
    const slug = listReportSlugs()[0];
    const meta = await generateMetadata(params(slug));
    // These came from the same S62g pass and are NOT what was removed.
    // `type` is only present on the article variant of the OpenGraph union.
    const og = meta.openGraph as { type?: string } | undefined;
    expect(og?.type).toBe("article");
    expect(meta.alternates?.canonical).toBe(`/reports/${slug}`);
    expect(String(meta.description ?? "").length).toBeGreaterThanOrEqual(100);
  });
});
