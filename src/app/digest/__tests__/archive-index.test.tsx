/**
 * Smoke test for /digest (archive index). Only I/O is listDigestDates,
 * mocked. Asserts the page links every archived issue (the whole point:
 * no sitemap-only orphans) and never fabricates one when the store is empty.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const listDigestDates = vi.fn();
vi.mock("@/lib/digest/archive", () => ({
  listDigestDates: (...args: unknown[]) => listDigestDates(...args),
}));

import DigestArchiveIndexPage, { metadata, revalidate } from "@/app/digest/page";

describe("/digest archive index", () => {
  beforeEach(() => listDigestDates.mockReset());

  it("links every archived issue, grouped by month, newest first", async () => {
    listDigestDates.mockResolvedValue(["2026-09-11", "2026-08-31", "2026-09-10"]);
    const html = renderToStaticMarkup(await DigestArchiveIndexPage());
    for (const d of ["2026-09-11", "2026-09-10", "2026-08-31"]) expect(html).toContain(`href="/digest/${d}"`);
    expect(html.indexOf("September 2026")).toBeLessThan(html.indexOf("August 2026"));
    expect(html.indexOf("/digest/2026-09-11")).toBeLessThan(html.indexOf("/digest/2026-09-10"));
    expect(html).toContain("3 issues");
  });

  it("empty store → honest empty state, no fabricated issue link", async () => {
    listDigestDates.mockResolvedValue([]);
    const html = renderToStaticMarkup(await DigestArchiveIndexPage());
    expect(html).toContain('data-testid="digest-archive-empty"');
    expect(html).not.toContain("/digest/2");
  });

  it("is indexable, self-canonical and cached (no per-crawl SCAN)", () => {
    expect(metadata.alternates?.canonical).toBe("https://gawk.dev/digest");
    expect(metadata.robots).toBeUndefined();
    expect(revalidate).toBe(3600);
  });
});
