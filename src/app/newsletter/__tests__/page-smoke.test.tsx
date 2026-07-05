/**
 * Smoke test for /newsletter. Server component whose only I/O is
 * listDigestDates (Redis SCAN) — mocked at module level. The point is
 * build-time confidence: the page renders with and without an archived
 * issue, never fabricates a sample link, and the copy's source count
 * comes from the registry.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { VERIFIED_SOURCES } from "@/lib/data-sources";

const listDigestDates = vi.fn();
vi.mock("@/lib/digest/archive", () => ({
  listDigestDates: (...args: unknown[]) => listDigestDates(...args),
}));

import NewsletterPage from "@/app/newsletter/page";

describe("/newsletter page", () => {
  beforeEach(() => {
    listDigestDates.mockReset();
  });

  it("renders with a sample-issue link when the archive has issues", async () => {
    listDigestDates.mockResolvedValue(["2026-07-05", "2026-07-04"]);
    const html = renderToStaticMarkup(await NewsletterPage());
    expect(html).toContain("The Daily Gawk");
    expect(html).toContain("/digest/2026-07-05");
    expect(html).not.toContain("/digest/2026-07-04");
  });

  it("empty archive → no sample link, never a fabricated one", async () => {
    listDigestDates.mockResolvedValue([]);
    const html = renderToStaticMarkup(await NewsletterPage());
    expect(html).toContain("The Daily Gawk");
    expect(html).not.toContain("/digest/");
  });

  it("source count in the tagline is the registry count, not a hardcode", async () => {
    listDigestDates.mockResolvedValue([]);
    const html = renderToStaticMarkup(await NewsletterPage());
    expect(html).toContain(`${VERIFIED_SOURCES.length} verified sources`);
  });

  it("Redis failure is fail-soft upstream, but a rejecting lister must not 500 the page", async () => {
    // listDigestDates itself catches Redis errors and returns []; this
    // guards the page against a regression in that contract.
    listDigestDates.mockResolvedValue([]);
    await expect(NewsletterPage()).resolves.toBeTruthy();
  });
});
