import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FeedView } from "@/components/feed/FeedView";
import type { FeedResponse } from "@/lib/feed/types";

const baseResponse: FeedResponse = {
  cards: [
    {
      id: "RESEARCH-x-1",
      type: "RESEARCH",
      severity: 40,
      headline: "New paper on transformer scaling",
      sourceName: "arXiv",
      sourceUrl: "https://arxiv.org/abs/2604.0",
      timestamp: "2026-04-28T08:00:00.000Z",
      meta: {},
    },
  ],
  quietDay: false,
  currentState: {
    topModel: { name: "Claude", sourceUrl: "https://openrouter.ai" },
    toolHealth: { operational: 5, degraded: 0, total: 5 },
    latestPaper: {
      title: "Latest",
      sourceUrl: "https://arxiv.org/abs/2604.0",
    },
  },
  lastComputed: "2026-04-28T10:00:00.000Z",
};

describe("FeedView — staleSources disclosure", () => {
  it("renders no stale notice when staleSources is omitted", () => {
    const html = renderToStaticMarkup(
      <FeedView initialResponse={baseResponse} disablePolling />,
    );
    expect(html).not.toContain("Live fetch failed");
    expect(html).not.toContain("ap-feed-stale-notice");
  });

  it("renders no stale notice when staleSources is empty", () => {
    const html = renderToStaticMarkup(
      <FeedView
        initialResponse={{ ...baseResponse, staleSources: [] }}
        disablePolling
      />,
    );
    expect(html).not.toContain("Live fetch failed");
  });

  it("renders the stale notice when one source is stale", () => {
    const html = renderToStaticMarkup(
      <FeedView
        initialResponse={{
          ...baseResponse,
          staleSources: [
            { source: "research", staleAsOf: "2026-04-28T07:00:00.000Z" },
          ],
        }}
        disablePolling
      />,
    );
    expect(html).toContain("ap-feed-stale-notice");
    expect(html).toContain("research");
    expect(html).toContain("Live fetch failed");
  });

  it("lists every stale source when more than one is degraded", () => {
    const html = renderToStaticMarkup(
      <FeedView
        initialResponse={{
          ...baseResponse,
          staleSources: [
            { source: "research", staleAsOf: "2026-04-28T07:00:00.000Z" },
            { source: "labs", staleAsOf: "2026-04-28T05:30:00.000Z" },
          ],
        }}
        disablePolling
      />,
    );
    expect(html).toContain("research");
    expect(html).toContain("labs");
  });
});
