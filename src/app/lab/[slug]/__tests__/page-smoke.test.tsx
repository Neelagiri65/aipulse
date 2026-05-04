/**
 * Smoke test for /lab/[slug]. Mocks fetchLabActivity so the test never
 * touches the GitHub Events API or the network.
 *
 * Coverage:
 *  - Slug ranked in the top-N renders the lab profile (name, HQ, GH org
 *    link, tracked repos with counts, per-event-type pills).
 *  - Slug ranked outside the top-N triggers notFound() (asserted via
 *    the mocked notFound throwing).
 *  - Quiet lab (zero 7d events) renders the QUIET 7D pill and the
 *    "tracked but quiet" copy instead of the typeEntries pills.
 *  - Stale lab renders the STALE banner.
 *  - fetchLabActivity throw → notFound (no crash).
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LabActivity, LabsPayload } from "@/lib/data/fetch-labs";

vi.mock("@/lib/data/fetch-labs", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/data/fetch-labs")
  >("@/lib/data/fetch-labs");
  return {
    ...actual,
    fetchLabActivity: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function makeLab(
  id: string,
  total: number,
  overrides: Partial<LabActivity> = {},
): LabActivity {
  const base: LabActivity = {
    id,
    displayName: id === "anthropic" ? "Anthropic" : id,
    kind: "industry",
    city: "San Francisco",
    country: "US",
    lat: 37.7749,
    lng: -122.4194,
    hqSourceUrl: `https://${id}.example.com/about`,
    url: `https://${id}.example.com`,
    orgs: [id],
    repos: [
      {
        owner: id,
        repo: "flagship",
        sourceUrl: `https://github.com/${id}/flagship`,
        total,
        byType: { PushEvent: total },
        stale: false,
      },
    ],
    total,
    byType: total > 0 ? { PushEvent: total } : {},
    stale: false,
  };
  return { ...base, ...overrides };
}

function makePayload(...labs: LabActivity[]): LabsPayload {
  return {
    labs,
    generatedAt: "2026-05-04T00:00:00Z",
    failures: [],
  };
}

async function loadPage() {
  const Mod = await import("@/app/lab/[slug]/page");
  return Mod.default;
}

describe("/lab/[slug]", () => {
  it("renders the lab profile when the slug is in the top-N by 7d activity", async () => {
    const fetchLabs = await import("@/lib/data/fetch-labs");
    vi.mocked(fetchLabs.fetchLabActivity).mockResolvedValue(
      makePayload(
        makeLab("anthropic", 1234),
        makeLab("openai", 999),
      ),
    );
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "anthropic" }) }),
    );
    expect(html).toContain("Anthropic");
    expect(html).toContain("San Francisco");
    expect(html).toContain("HQ source");
    expect(html).toContain("1,234");
    expect(html).toContain("anthropic/flagship");
    expect(html).toContain("github.com/anthropic"); // GH org link
    expect(html).toContain("PUSH");
  });

  it("returns notFound when the slug is ranked outside the top-N", async () => {
    const fetchLabs = await import("@/lib/data/fetch-labs");
    // Fill the top-10 with 10 active labs; ours has 0 events → ranked 11+.
    const top10 = Array.from({ length: 10 }, (_, i) =>
      makeLab(`top-${i}`, 100 - i),
    );
    vi.mocked(fetchLabs.fetchLabActivity).mockResolvedValue(
      makePayload(...top10, makeLab("anthropic", 0)),
    );
    const Page = await loadPage();
    await expect(
      Page({ params: Promise.resolve({ slug: "anthropic" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns notFound for an unknown slug", async () => {
    const fetchLabs = await import("@/lib/data/fetch-labs");
    vi.mocked(fetchLabs.fetchLabActivity).mockResolvedValue(
      makePayload(makeLab("anthropic", 100)),
    );
    const Page = await loadPage();
    await expect(
      Page({ params: Promise.resolve({ slug: "ghost" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the QUIET 7D pill and quiet copy when the lab has zero 7d events", async () => {
    const fetchLabs = await import("@/lib/data/fetch-labs");
    vi.mocked(fetchLabs.fetchLabActivity).mockResolvedValue(
      makePayload(makeLab("anthropic", 0)),
    );
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "anthropic" }) }),
    );
    expect(html).toContain("QUIET 7D");
    expect(html).toContain("tracked");
  });

  it("renders the STALE pill when any tracked repo failed to fetch", async () => {
    const fetchLabs = await import("@/lib/data/fetch-labs");
    const stale = makeLab("anthropic", 5, { stale: true });
    vi.mocked(fetchLabs.fetchLabActivity).mockResolvedValue(
      makePayload(stale),
    );
    const Page = await loadPage();
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: "anthropic" }) }),
    );
    expect(html).toContain("STALE");
  });

  it("returns notFound when fetchLabActivity throws (graceful degradation)", async () => {
    const fetchLabs = await import("@/lib/data/fetch-labs");
    vi.mocked(fetchLabs.fetchLabActivity).mockRejectedValue(
      new Error("GH_TOKEN unset"),
    );
    const Page = await loadPage();
    await expect(
      Page({ params: Promise.resolve({ slug: "anthropic" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
