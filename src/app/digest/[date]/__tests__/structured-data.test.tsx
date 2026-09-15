/**
 * Each archived issue carries an Article + BreadcrumbList JSON-LD graph and a
 * real og:image (that day's tool-health chart); the archive index carries a
 * CollectionPage the issues say they are part of. Parsed, not string-matched.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/digest/archive", () => ({
  listDigestDates: async () => ["2026-09-11", "2026-09-10", "2026-09-09"],
  readDigestBody: async (date: string) =>
    date === "2026-09-10"
      ? { date, subject: "gawk.dev — 2026-09-10 · 3 tool incidents", mode: "normal", generatedAt: "2026-09-10T08:00:00Z", greetingTemplate: "", sections: [] }
      : null,
}));

import DigestArchivePage, { generateMetadata } from "@/app/digest/[date]/page";
import DigestArchiveIndexPage from "@/app/digest/page";

function ldFrom(html: string, testid: string): { "@graph": Array<Record<string, unknown>> } {
  const m = html.match(new RegExp(`data-testid="${testid}"[^>]*>(.*?)</script>`));
  if (!m) throw new Error(`no ${testid}`);
  return JSON.parse(m[1]);
}

describe("digest issue structured data", () => {
  it("Article + BreadcrumbList, author/publisher = the site org, image = the day's chart", async () => {
    const html = renderToStaticMarkup(await DigestArchivePage({ params: Promise.resolve({ date: "2026-09-10" }) }));
    const ld = ldFrom(html, "digest-jsonld");
    const article = ld["@graph"].find((n) => n["@type"] === "Article")!;
    const crumbs = ld["@graph"].find((n) => n["@type"] === "BreadcrumbList")! as { itemListElement: Array<{ name: string; item: string }> };
    expect(article.headline).toBe("gawk.dev — 2026-09-10 · 3 tool incidents");
    expect(article.datePublished).toBe("2026-09-10T08:00:00Z");
    expect(article.author).toEqual({ "@id": "https://gawk.dev/#org" });
    expect(article.image).toEqual(["https://gawk.dev/api/digest/chart/tool-health/2026-09-10"]);
    expect(article.isPartOf).toEqual({ "@type": "CollectionPage", "@id": "https://gawk.dev/digest#archive" });
    expect(crumbs.itemListElement.map((c) => c.item)).toEqual(["https://gawk.dev/", "https://gawk.dev/digest", "https://gawk.dev/digest/2026-09-10"]);
  });

  it("og:image and twitter image are that day's chart, with dimensions", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ date: "2026-09-10" }) });
    const og = md.openGraph as { images: Array<{ url: string; width: number; height: number }> };
    expect(og.images[0]).toMatchObject({ url: "https://gawk.dev/api/digest/chart/tool-health/2026-09-10", width: 720, height: 320 });
    expect((md.twitter as { images: string[] }).images).toEqual(["https://gawk.dev/api/digest/chart/tool-health/2026-09-10"]);
  });
});

describe("archive index structured data", () => {
  it("CollectionPage with the newest issues as parts, under the site's WebSite and Organization", async () => {
    const html = renderToStaticMarkup(await DigestArchiveIndexPage());
    const ld = ldFrom(html, "archive-jsonld");
    const page = ld["@graph"].find((n) => n["@type"] === "CollectionPage")! as { hasPart: Array<{ url: string }>; isPartOf: unknown; "@id": string };
    expect(page["@id"]).toBe("https://gawk.dev/digest#archive");
    expect(page.isPartOf).toEqual({ "@id": "https://gawk.dev/#website" });
    expect(page.hasPart.map((p) => p.url)).toEqual(["https://gawk.dev/digest/2026-09-11", "https://gawk.dev/digest/2026-09-10", "https://gawk.dev/digest/2026-09-09"]);
  });
});
