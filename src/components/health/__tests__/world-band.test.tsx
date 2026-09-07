/**
 * Render test for the world-in-marks band: every state carries its own caption and provenance, the
 * marks come only from real located points, and the ODbL land-mask attribution is visible text.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorldBand } from "@/components/health/WorldBand";
import type { GlobeEventsResult } from "@/lib/data/fetch-events";

const noop = () => {};

function result(points: Array<{ lat: number; lng: number }>): GlobeEventsResult {
  return {
    points: points.map((p) => ({ ...p, color: "#cbd5e1" })),
    polledAt: "2026-09-05T07:01:00.000Z",
    coverage: {
      eventsReceived: 1600,
      eventsWithLocation: points.length,
      locationCoveragePct: 86,
      windowSize: 1600,
      windowAiConfig: 312,
      windowMinutes: 240,
    },
    failures: [],
    source: "redis",
  };
}

const solid = (html: string) => (html.match(/ap-worldband__solid/g) ?? []).length;
const hollow = (html: string) => (html.match(/ap-worldband__hollow/g) ?? []).length;

describe("WorldBand", () => {
  it("pending: draws land hollow, no solid cell, and says nothing is recorded yet", () => {
    const html = renderToStaticMarkup(<WorldBand events={undefined} loading onOpenMap={noop} />);
    expect(html).toContain('data-state="pending"');
    expect(solid(html)).toBe(0);
    expect(hollow(html)).toBeGreaterThan(500);
    expect(html).toContain("Waiting for the first events poll");
  });

  it("unavailable: no data and a poll error → names the failure, never a number", () => {
    const html = renderToStaticMarkup(
      <WorldBand events={undefined} loading={false} error="HTTP 503" onOpenMap={noop} />,
    );
    expect(html).toContain('data-state="unavailable"');
    expect(html).toContain("Events source unavailable (HTTP 503)");
    expect(solid(html)).toBe(0);
  });

  it("live: one solid cell per located point cell, caption from the coverage block", () => {
    const html = renderToStaticMarkup(
      <WorldBand
        events={result([
          { lat: 51.5074, lng: -0.1278 }, // London
          { lat: 51.5175, lng: -0.1325 }, // London again → same cell
          { lat: 37.7749, lng: -122.4194 }, // San Francisco
        ])}
        loading={false}
        onOpenMap={noop}
      />,
    );
    expect(html).toContain('data-state="live"');
    expect(solid(html)).toBe(2);
    expect(html).toContain("3 located public events in the rolling 240-min window");
    expect(html).toContain("312 on repos with AI config");
    expect(html).toContain("a location was known for 86% of events received");
    expect(html).toContain("polled 07:01 UTC");
    expect(html).toContain("© OpenStreetMap contributors (ODbL)");
    expect(html).toContain("Where events landed · last 4h");
  });

  it("live with zero points: says 0, draws land hollow", () => {
    const html = renderToStaticMarkup(<WorldBand events={result([])} loading={false} onOpenMap={noop} />);
    expect(html).toContain("0 located public events");
    expect(solid(html)).toBe(0);
  });

  it("counts points outside the 74°N–56°S span honestly instead of dropping them silently", () => {
    const html = renderToStaticMarkup(
      <WorldBand
        events={result([
          { lat: 78.2, lng: 15.6 }, // Svalbard, above the band
          { lat: 48.86, lng: 2.35 },
        ])}
        loading={false}
        onOpenMap={noop}
      />,
    );
    expect(html).toContain("1 located public events");
    expect(html).toMatch(/1 outside the band.{1,8}s 74°N–56°S span/);
  });

  it("stale: keeps the last good poll's marks and says the latest poll failed", () => {
    const html = renderToStaticMarkup(
      <WorldBand events={result([{ lat: 48.86, lng: 2.35 }])} loading={false} error="timeout" onOpenMap={noop} />,
    );
    expect(html).toContain('data-state="stale"');
    expect(solid(html)).toBe(1);
    expect(html).toContain("last good poll 07:01 UTC; the latest poll failed (timeout)");
  });

  it("degraded: a poll that located nothing or ran without its store says so, and is not 'live'", () => {
    const r = result([]);
    r.coverage.eventsReceived = 66;
    r.coverage.eventsWithLocation = 0;
    r.source = "inprocess-fallback";
    const html = renderToStaticMarkup(<WorldBand events={r} loading={false} onOpenMap={noop} />);
    expect(html).toContain('data-state="degraded"');
    expect(html).toContain("no received event had a known location");
    expect(html).toContain("event store unavailable");
    const empty = result([]);
    empty.coverage.eventsReceived = 0;
    expect(renderToStaticMarkup(<WorldBand events={empty} loading={false} onOpenMap={noop} />)).toContain(
      "no events received in the window",
    );
  });

  it("phone grid: 60 columns, same provenance", () => {
    const html = renderToStaticMarkup(<WorldBand events={result([])} loading={false} cols={60} onOpenMap={noop} />);
    expect(html).toContain('viewBox="0 0 480 248"');
    expect(html).toContain("© OpenStreetMap contributors");
  });
});
