/**
 * Render tests for the S60 Build 4 translate pill on the wire surfaces.
 *
 * Verifies:
 *   - RegionalWirePanel renders the Translate link next to publishers
 *     and inline articles whose lang !== "en".
 *   - English sources (lang === "en") do NOT render the pill.
 *   - SourceCard renders the publisher-level pill + per-item pills
 *     for non-English content.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  RssSourcePanel,
  RssWireItem,
  RssWireResult,
} from "@/lib/data/wire-rss";
import { RegionalWirePanel } from "@/components/wire/RegionalWirePanel";
import { SourceCard } from "@/components/wire/SourceCard";

// Some leaflet-adjacent imports touch window during evaluation; the
// wire panel itself is a pure presentational client component so it
// renders fine on the server when DOM globals are tolerated.

function mkItem(overrides: Partial<RssWireItem> = {}): RssWireItem {
  return {
    id: "x",
    sourceId: "test",
    title: "Test article",
    url: "https://example.com/article",
    publishedTs: 1_777_000_000,
    firstSeenTs: "2026-05-03T10:00:00Z",
    lastRefreshTs: "2026-05-03T10:00:00Z",
    description: "",
    kind: "rss",
    sourceDisplayName: "Test",
    city: "Berlin",
    country: "DE",
    lat: 0,
    lng: 0,
    lang: "en",
    ...overrides,
  };
}

function mkSource(overrides: Partial<RssSourcePanel> = {}): RssSourcePanel {
  return {
    id: "heise-ai",
    displayName: "Heise Online",
    city: "Hannover",
    country: "DE",
    lat: 52.3759,
    lng: 9.732,
    lang: "de",
    hqSourceUrl: "https://en.wikipedia.org/wiki/Heise_online",
    publisherUrl: "https://www.heise.de/",
    rssUrl: "https://www.heise.de/rss/heise-atom.xml",
    feedFormat: "atom",
    keywordFilterScope: "ai-only",
    itemsLast24h: 5,
    itemsLast7d: 30,
    lastFetchOkTs: "2026-05-03T10:00:00Z",
    staleHours: 0,
    stale: false,
    recentItems: [
      mkItem({
        id: "h1",
        sourceId: "heise-ai",
        title: "KI-Trends 2026",
        url: "https://www.heise.de/news/ki-trends-2026",
        lang: "de",
      }),
    ],
    ...overrides,
  };
}

function mkResult(overrides: Partial<RssWireResult> = {}): RssWireResult {
  return {
    ok: true,
    source: "redis",
    sources: [mkSource()],
    polledAt: "2026-05-03T10:00:00Z",
    meta: {
      lastFetchOkTs: "2026-05-03T10:00:00Z",
      lastFetchAttemptTs: "2026-05-03T10:00:00Z",
      lastError: null,
      sourcesOk: 1,
      sourcesFailed: 0,
    },
    ...overrides,
  } as RssWireResult;
}

describe("RegionalWirePanel — translate pill (S60 Build 4)", () => {
  it("renders Translate next to a German publisher", () => {
    const html = renderToStaticMarkup(
      <RegionalWirePanel
        data={mkResult()}
        error={undefined}
        isInitialLoading={false}
      />,
    );
    expect(html).toContain("Translate");
    expect(html).toContain("translate.google.com/translate");
  });

  it("does NOT render Translate for an English-only registry", () => {
    const englishOnly = mkResult({
      sources: [
        mkSource({
          id: "the-register-ai",
          displayName: "The Register",
          city: "London",
          country: "UK",
          lang: "en",
          publisherUrl: "https://www.theregister.com/",
          rssUrl: "https://www.theregister.com/headlines.atom",
          recentItems: [
            mkItem({
              id: "tr1",
              sourceId: "the-register-ai",
              url: "https://www.theregister.com/2026/05/03/test",
              lang: "en",
            }),
          ],
        }),
      ],
    });
    const html = renderToStaticMarkup(
      <RegionalWirePanel
        data={englishOnly}
        error={undefined}
        isInitialLoading={false}
      />,
    );
    expect(html).not.toContain("translate.google.com");
  });
});

describe("SourceCard — translate pill (S60 Build 4)", () => {
  it("renders a publisher-level translate pill on a non-English source", () => {
    const html = renderToStaticMarkup(
      <SourceCard
        source={mkSource()}
        anchor={{ x: 200, y: 200 }}
        containerSize={{ w: 1024, h: 768 }}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Translate");
    expect(html).toContain(
      encodeURIComponent("https://www.heise.de/"),
    );
  });

  it("renders per-item translate pills on non-English recent items", () => {
    const html = renderToStaticMarkup(
      <SourceCard
        source={mkSource()}
        anchor={{ x: 200, y: 200 }}
        containerSize={{ w: 1024, h: 768 }}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain(
      encodeURIComponent("https://www.heise.de/news/ki-trends-2026"),
    );
  });

  it("renders no pill for an English-only source", () => {
    const englishSource = mkSource({
      id: "the-register-ai",
      displayName: "The Register",
      lang: "en",
      publisherUrl: "https://www.theregister.com/",
      recentItems: [
        mkItem({
          id: "tr1",
          sourceId: "the-register-ai",
          url: "https://www.theregister.com/2026/05/03/test",
          lang: "en",
        }),
      ],
    });
    const html = renderToStaticMarkup(
      <SourceCard
        source={englishSource}
        anchor={{ x: 200, y: 200 }}
        containerSize={{ w: 1024, h: 768 }}
        onClose={vi.fn()}
      />,
    );
    expect(html).not.toContain("translate.google.com");
  });
});
