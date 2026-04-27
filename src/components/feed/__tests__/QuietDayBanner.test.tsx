import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { QuietDayBanner } from "@/components/feed/QuietDayBanner";
import type { CurrentState } from "@/lib/feed/types";

const state: CurrentState = {
  topModel: {
    name: "Claude Sonnet 4.6",
    sourceUrl: "https://openrouter.ai/anthropic/claude-sonnet-4.6",
  },
  toolHealth: { operational: 6, degraded: 0, total: 6 },
  latestPaper: {
    title: "On something interesting",
    sourceUrl: "https://arxiv.org/abs/2604.15306v1",
  },
};

describe("QuietDayBanner", () => {
  it("renders the locked banner copy verbatim", () => {
    const html = renderToStaticMarkup(<QuietDayBanner currentState={state} />);
    expect(html).toContain(
      "All quiet — 28 sources tracked, no significant moves today",
    );
  });

  it("renders the top model with a clickable link", () => {
    const html = renderToStaticMarkup(<QuietDayBanner currentState={state} />);
    expect(html).toContain("Claude Sonnet 4.6");
    expect(html).toMatch(
      /href="https:\/\/openrouter\.ai\/anthropic\/claude-sonnet-4\.6"/,
    );
  });

  it("renders the tool-health summary as operational/total", () => {
    const html = renderToStaticMarkup(<QuietDayBanner currentState={state} />);
    expect(html).toContain("6/6");
  });

  it("renders the latest paper title with a clickable link", () => {
    const html = renderToStaticMarkup(<QuietDayBanner currentState={state} />);
    expect(html).toContain("On something interesting");
    expect(html).toMatch(/href="https:\/\/arxiv\.org\/abs\/2604\.15306v1"/);
  });
});
