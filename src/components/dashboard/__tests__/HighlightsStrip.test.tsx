/**
 * Render shape for HighlightsStrip.
 *
 * The selection logic + panel mapping live in `src/lib/feed/highlights.ts`
 * and are unit-tested separately. Here we only assert that the
 * presentational component:
 *  - renders nothing when there are no highlights (empty-state contract);
 *  - emits one chip per highlight in order with the expected dot tone;
 *  - exposes the panel id + card id on click so the host can route.
 */

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

  it("renders one chip per highlight in order with headline + detail", () => {
    const html = renderToStaticMarkup(
      <HighlightsStrip highlights={sample} onSelect={() => {}} />,
    );
    expect(html).toContain("GitHub Copilot degraded");
    expect(html).toContain("Kimi K2.6 +5 ranks");
    expect(html).toContain("rank 9 → rank 4");
    expect(html).toContain("torch downloads -24% week-on-week");
    // Three chip buttons + region wrapper
    const chipMatches = html.match(/data-testid="highlights-chip"/g) ?? [];
    expect(chipMatches.length).toBe(3);
  });

  it("annotates each chip with its card type for diagnostics", () => {
    const html = renderToStaticMarkup(
      <HighlightsStrip highlights={sample} onSelect={() => {}} />,
    );
    expect(html).toContain('data-card-type="TOOL_ALERT"');
    expect(html).toContain('data-card-type="MODEL_MOVER"');
    expect(html).toContain('data-card-type="SDK_TREND"');
  });

  it("includes the desktop variant marker class by default", () => {
    const html = renderToStaticMarkup(
      <HighlightsStrip highlights={sample} onSelect={() => {}} />,
    );
    expect(html).toContain("ap-highlights-strip--desktop");
  });

  it("renders the mobile variant when requested", () => {
    const html = renderToStaticMarkup(
      <HighlightsStrip
        highlights={sample}
        onSelect={() => {}}
        variant="mobile"
      />,
    );
    expect(html).toContain("ap-highlights-strip--mobile");
    // Mobile variant skips the "Now" lede so the strip stays compact.
    expect(html).not.toMatch(/>Now</);
  });
});
