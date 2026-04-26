/**
 * Render-level tests for the mobile shell. The shell branches off
 * Dashboard at viewports ≤767px and rebuilds the panel layout as a
 * single-active-tab feed; these tests pin the shape of that layout so
 * a careless edit can't quietly remove a tab or the brand bar.
 *
 * Tests run in the node environment via renderToStaticMarkup (no DOM,
 * no events). They cover what the SSR pass produces — the tab strip,
 * brand bar, footer chips, and the default Map tab body. Tab-switch
 * behaviour is interactive and not covered here; it lives at the
 * useState boundary.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MobileDashboard } from "@/components/dashboard/MobileDashboard";

const baseProps = {
  points: [],
  events: undefined,
  eventsLoading: false,
  eventsError: null,
  status: undefined,
  statusFreshness: {
    isInitialLoading: false,
    intervalMs: 60_000,
    lastSuccessAt: Date.now(),
  },
  statusError: null,
  wireRows: [],
  hn: undefined,
  hnLoading: false,
  models: undefined,
  modelsLoading: false,
  modelsError: null,
  research: undefined,
  researchLoading: false,
  researchError: null,
  benchmarks: undefined,
  benchmarksLoading: false,
  benchmarksError: null,
  labs: undefined,
  labsLoading: false,
  labsError: null,
  rss: undefined,
  rssLoading: false,
  rssError: null,
  sdkAdoption: null,
  sdkAdoptionLoading: false,
  sdkAdoptionError: null,
  modelUsage: null,
  modelUsageLoading: false,
  modelUsageError: null,
  cronHealth: undefined,
};

describe("MobileDashboard — shell", () => {
  it("renders the brand row with the AI PULSE wordmark", () => {
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).toContain("AI PULSE");
    expect(html).toContain("ap-mobile-brand");
  });

  it("renders all ten tab labels", () => {
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    for (const label of [
      "Map",
      "Wire",
      "Tools",
      "Models",
      "Research",
      "Bench",
      "Labs",
      "Regional",
      "SDK",
      "Usage",
    ]) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it("default tab is Map (active class on the Map tab)", () => {
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).toMatch(
      /class="ap-mobile-tabs__item is-active"[^>]*>[^<]*<span class="ap-mobile-tabs__label">Map</,
    );
  });

  it("Map tab body mounts the FlatMap container + caveat strip", () => {
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).toContain("ap-mobile-map");
    expect(html).toContain("ap-mobile-map__caveat");
  });

  it("freshness chip reads 'live' when last success is fresh", () => {
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).toContain("ap-mobile-chip--ok");
    expect(html).toContain(">live<");
  });

  it("freshness chip reads 'connecting' on first load", () => {
    const html = renderToStaticMarkup(
      <MobileDashboard
        {...baseProps}
        statusFreshness={{
          isInitialLoading: true,
          intervalMs: 60_000,
          lastSuccessAt: undefined,
        }}
      />,
    );
    expect(html).toContain("ap-mobile-chip--pending");
    expect(html).toContain(">connecting<");
  });

  it("cron-health chip surfaces healthy/total split, warn-tone when stale > 0", () => {
    const html = renderToStaticMarkup(
      <MobileDashboard
        {...baseProps}
        cronHealth={{ total: 17, healthy: 16, stale: 1 }}
      />,
    );
    expect(html).toContain("ap-mobile-footer__cron--warn");
    expect(html).toContain("16/17 crons");
    expect(html).toContain("· 1 stale");
  });

  it("cron-health chip is ok-toned when no stale crons", () => {
    const html = renderToStaticMarkup(
      <MobileDashboard
        {...baseProps}
        cronHealth={{ total: 17, healthy: 17, stale: 0 }}
      />,
    );
    expect(html).toContain("ap-mobile-footer__cron--ok");
    expect(html).toContain("17/17 crons");
  });

  it("sources link points to /data-sources.md and opens in new tab", () => {
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).toContain('href="/data-sources.md"');
    expect(html).toContain('target="_blank"');
  });
});
