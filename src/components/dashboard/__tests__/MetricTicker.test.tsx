/**
 * Render-level tests for the trust-ticker caveats:
 *   - the per-cell title= caveats are present (geocoder bias, AI-config
 *     lower-bound, events-not-developers, sources/cron contract);
 *   - the Sources tile surfaces "{healthy}/{total} crons · {stale} stale"
 *     when a cron is stale, so a green-looking ticker can never lie about
 *     a red StatusBar above it.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricTicker } from "@/components/dashboard/MetricTicker";

const baseProps = {
  status: undefined,
  events: undefined,
  verifiedSourceCount: 28,
  pendingSourceCount: 0,
  statusLoading: false,
  eventsLoading: false,
};

describe("MetricTicker — caveats", () => {
  it("renders the geocoder-bias caveat as a tooltip", () => {
    const html = renderToStaticMarkup(<MetricTicker {...baseProps} />);
    expect(html).toContain("Biased toward English-speaking regions");
  });

  it("renders the AI-config lower-bound caveat", () => {
    const html = renderToStaticMarkup(<MetricTicker {...baseProps} />);
    expect(html).toContain("Lower bound");
    expect(html).toContain("CLAUDE.md");
  });

  it("renders the events-not-developers caveat", () => {
    const html = renderToStaticMarkup(<MetricTicker {...baseProps} />);
    expect(html).toContain("not unique developers");
  });

  it("renders the sources-vs-crons caveat", () => {
    const html = renderToStaticMarkup(<MetricTicker {...baseProps} />);
    expect(html).toContain("registry entries");
  });
});

describe("MetricTicker — sources/cron-health surfacing", () => {
  it("shows healthy/total cron split when no crons are stale", () => {
    const html = renderToStaticMarkup(
      <MetricTicker
        {...baseProps}
        cronHealth={{ total: 16, healthy: 16, stale: 0 }}
      />,
    );
    expect(html).toContain("16/16 crons");
    // Stamp slot for the Sources tile should not flag a stale segment.
    expect(html).not.toMatch(/16\/16 crons[^<]*·[^<]*\d+ stale/);
  });

  it("shows both healthy/total and stale count when a cron is stale", () => {
    const html = renderToStaticMarkup(
      <MetricTicker
        {...baseProps}
        cronHealth={{ total: 16, healthy: 14, stale: 2 }}
      />,
    );
    expect(html).toContain("14/16 crons · 2 stale");
  });

  it("falls back to no cron stamp when cronHealth is undefined", () => {
    const html = renderToStaticMarkup(<MetricTicker {...baseProps} />);
    // No cron stamp is rendered before the cron-health endpoint resolves.
    expect(html).not.toMatch(/\d+\/\d+ crons/);
  });
});
