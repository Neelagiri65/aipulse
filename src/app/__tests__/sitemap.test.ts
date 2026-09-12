/**
 * /sitemap.xml shape. Two things a crawler is sensitive to:
 *  - the archive hub (/digest) is listed, so the 100+ issue pages have a parent;
 *  - lastModified is only present where it is true (a digest's own date), never
 *    a generation-time "now" on static pages, which teaches crawlers to ignore
 *    the field for the whole file.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/digest/archive", () => ({
  listDigestDates: async () => ["2026-09-11", "2026-09-10"],
}));
vi.mock("@/lib/reports/registry", () => ({
  listReportSlugs: () => ["2026-04-tooling"],
}));

import sitemap from "@/app/sitemap";

describe("sitemap.xml", () => {
  it("lists the archive hub and every issue under it", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain("https://gawk.dev/digest");
    expect(urls).toContain("https://gawk.dev/digest/2026-09-11");
    expect(urls).toContain("https://gawk.dev/digest/2026-09-10");
    expect(urls).toContain("https://gawk.dev/reports/2026-04-tooling");
    expect(urls[0]).toBe("https://gawk.dev/");
  });

  it("lastModified only where it is real: on issues, not on static or report pages", async () => {
    const entries = await sitemap();
    const issue = entries.find((e) => e.url.endsWith("/digest/2026-09-10"));
    expect(issue?.lastModified).toEqual(new Date("2026-09-10T00:00:00Z"));
    for (const e of entries.filter((e) => !/\/digest\/\d{4}-\d{2}-\d{2}$/.test(e.url))) {
      expect(e.lastModified, e.url).toBeUndefined();
    }
  });
});
