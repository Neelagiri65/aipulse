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
  it("renders the brand row with the GAWK wordmark", () => {
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).toContain("GAWK");
    expect(html).toContain("ap-mobile-brand");
  });

  it("renders the bottom-bar primary tabs (FEED, MAP, PANELS)", () => {
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).toContain("ap-mobile-bottombar");
    for (const label of ["FEED", "MAP", "PANELS"]) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it("default top-level tab is FEED (per S40 PRD)", () => {
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).toMatch(/data-top-tab="feed"/);
    expect(html).toMatch(
      /class="ap-mobile-bottombar__item is-active"[^>]*data-tab="feed"/,
    );
  });

  it("FEED tab renders the feed surface (loading skeleton on SSR)", () => {
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).toContain("ap-mobile-feed");
    expect(html).toContain('data-feed-state="loading"');
  });

  it("does not render the pre-consolidation flat tabs (Tools/Research/Bench/Labs/Regional/SDK/Usage)", () => {
    // These were standalone top tabs in the first mobile shell. After
    // consolidation they live inside Models sub-tabs or the More
    // accordion — never as their own scroll-strip entries.
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).not.toMatch(/class="ap-mobile-tabs__label">Tools</);
    expect(html).not.toMatch(/class="ap-mobile-tabs__label">Research</);
    expect(html).not.toMatch(/class="ap-mobile-tabs__label">SDK</);
  });

  it("does not render the panels sub-tab strip on the default FEED tab", () => {
    // The 4 sub-tabs (Wire / Health / Models / More) only appear when
    // the user has switched to the PANELS top-level tab.
    const html = renderToStaticMarkup(<MobileDashboard {...baseProps} />);
    expect(html).not.toContain("ap-mobile-tabs__item");
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
