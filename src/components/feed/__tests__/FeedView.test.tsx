import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FeedView } from "@/components/feed/FeedView";
import type { FeedResponse } from "@/lib/feed/types";

const sampleResponse: FeedResponse = {
  cards: [
    {
      id: "TOOL_ALERT-x-1",
      type: "TOOL_ALERT",
      severity: 100,
      headline: "Claude Code is reporting a major outage",
      sourceName: "Anthropic Status",
      sourceUrl: "https://status.claude.com",
      timestamp: "2026-04-27T11:00:00.000Z",
      meta: {},
    },
  ],
  quietDay: false,
  currentState: {
    topModel: { name: "Claude", sourceUrl: "https://openrouter.ai" },
    toolHealth: { operational: 5, degraded: 1, total: 6 },
    latestPaper: {
      title: "Latest",
      sourceUrl: "https://arxiv.org/abs/2604.0",
    },
  },
  lastComputed: "2026-04-27T12:00:00.000Z",
};

describe("FeedView (SSR shape)", () => {
  it("renders nothing data-bound on the SSR pass (client-only fetch)", () => {
    // FeedView fetches /api/feed on the client. The SSR pass renders
    // a loading skeleton; this asserts the skeleton is present and
    // no card text appears server-side.
    const html = renderToStaticMarkup(<FeedView />);
    expect(html).toContain('data-feed-state="loading"');
  });

  it("renders cards when given an initialResponse override", () => {
    const html = renderToStaticMarkup(
      <FeedView initialResponse={sampleResponse} />,
    );
    expect(html).toContain("Claude Code is reporting a major outage");
    expect(html).toContain('data-feed-state="ready"');
  });

  it("renders QuietDayBanner when initialResponse.quietDay is true", () => {
    const html = renderToStaticMarkup(
      <FeedView
        initialResponse={{
          ...sampleResponse,
          cards: [],
          quietDay: true,
        }}
      />,
    );
    expect(html).toContain(
      "All quiet — 28 sources tracked, no significant moves today",
    );
  });
});
