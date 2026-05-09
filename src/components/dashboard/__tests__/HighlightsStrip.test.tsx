import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { HighlightsStrip } from "@/components/dashboard/HighlightsStrip";
import type { Highlight } from "@/lib/feed/highlights";

const sample: Highlight[] = [
  {
    card: {
      id: "tool-1",
      type: "TOOL_ALERT",
      severity: 100,
      headline: "GitHub Copilot degraded",
      sourceName: "GitHub Status",
      sourceUrl: "https://www.githubstatus.com",
      timestamp: "2026-04-29T11:00:00.000Z",
      meta: {},
    },
    panel: "tools",
    tone: "outage",
  },
  {
    card: {
      id: "model-1",
      type: "MODEL_MOVER",
      severity: 80,
      headline: "Kimi K2.6 +5 ranks",
      detail: "rank 9 → rank 4",
      sourceName: "OpenRouter",
      sourceUrl: "https://openrouter.ai/rankings",
      timestamp: "2026-04-29T10:30:00.000Z",
      meta: {},
    },
    panel: "model-usage",
    tone: "degrade",
  },
  {
    card: {
      id: "sdk-1",
      type: "SDK_TREND",
      severity: 60,
      headline: "torch downloads -24% week-on-week",
      sourceName: "PyPI",
      sourceUrl: "https://pypistats.org",
      timestamp: "2026-04-29T09:00:00.000Z",
      meta: {},
    },
    panel: "sdk-adoption",
    tone: "degrade",
  },
];

describe("HighlightsStrip", () => {
  it("renders nothing when there are no highlights", () => {
    const html = renderToStaticMarkup(
      <HighlightsStrip highlights={[]} onSelect={() => {}} />,
    );
    expect(html).toBe("");
  });

  it("desktop: renders one chip at a time (rotating ticker)", () => {
    const html = renderToStaticMarkup(
      <HighlightsStrip highlights={sample} onSelect={() => {}} />,
    );
    expect(html).toContain("GitHub Copilot degraded");
    expect(html).toContain('data-card-type="TOOL_ALERT"');
    const chipMatches = html.match(/data-testid="highlights-chip"/g) ?? [];
    expect(chipMatches.length).toBe(1);
    expect(html).toContain("1/3");
  });

  it("includes the desktop variant marker class by default", () => {
    const html = renderToStaticMarkup(
      <HighlightsStrip highlights={sample} onSelect={() => {}} />,
    );
    expect(html).toContain("ap-highlights-strip--desktop");
  });

  it("mobile: renders all chips for horizontal scrolling", () => {
    const html = renderToStaticMarkup(
      <HighlightsStrip
        highlights={sample}
        onSelect={() => {}}
        variant="mobile"
      />,
    );
    expect(html).toContain("ap-highlights-strip--mobile");
    expect(html).toContain("GitHub Copilot degraded");
    expect(html).toContain("Kimi K2.6 +5 ranks");
    expect(html).toContain("torch downloads -24% week-on-week");
    const chipMatches = html.match(/data-testid="highlights-chip"/g) ?? [];
    expect(chipMatches.length).toBe(3);
  });
});
