import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarksPanel } from "@/components/benchmarks/BenchmarksPanel";
import type { BenchmarksPayload } from "@/lib/data/benchmarks-lmarena";

function makePayload(): BenchmarksPayload {
  return {
    ok: true,
    rows: [
      {
        rank: 1,
        modelName: "kimi-k2.6",
        organization: "moonshotai",
        rating: 1400.4,
        ratingLower: 1395,
        ratingUpper: 1406,
        voteCount: 12345,
        category: "overall",
        leaderboardPublishDate: "2026-04-29",
        rankDelta: { kind: "same" },
        eloDelta: { kind: "same" },
      },
      {
        rank: 2,
        modelName: "claude-sonnet-4.6",
        organization: "anthropic",
        rating: 1395.1,
        ratingLower: 1390,
        ratingUpper: 1400,
        voteCount: 9876,
        category: "overall",
        leaderboardPublishDate: "2026-04-29",
        rankDelta: { kind: "down", amount: 1 },
        eloDelta: { kind: "change", amount: -3 },
      },
    ],
    meta: {
      leaderboardPublishDate: "2026-04-29",
      prevPublishDate: "2026-04-22",
      totalVotes: 1_000_000,
      staleDays: 0,
      fetchedAt: "2026-04-29T03:15:00.000Z",
    },
    sanity: { ok: true, warnings: [] },
  };
}

describe("BenchmarksPanel — Trend column (S48g sparkline retrofit)", () => {
  it("renders the Trend header always", () => {
    const html = renderToStaticMarkup(
      <BenchmarksPanel
        data={makePayload()}
        error={undefined}
        isInitialLoading={false}
      />,
    );
    expect(html).toContain(">Trend<");
  });

  it("renders an empty placeholder when eloHistory is undefined (initial paint)", () => {
    const html = renderToStaticMarkup(
      <BenchmarksPanel
        data={makePayload()}
        error={undefined}
        isInitialLoading={false}
      />,
    );
    // Empty placeholder span carries aria-hidden so screen readers don't
    // announce empty cells.
    expect(html).toContain('aria-hidden="true"');
    // No SVG sparkline rendered yet.
    expect(html).not.toContain("<svg");
  });

  it("renders a SparklineMini for rows with ≥2 history points", () => {
    const html = renderToStaticMarkup(
      <BenchmarksPanel
        data={makePayload()}
        error={undefined}
        isInitialLoading={false}
        eloHistory={{
          "kimi-k2.6": [1390, 1395, 1400],
          "claude-sonnet-4.6": [1398, 1397, 1395],
        }}
      />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("14-day Elo history for kimi-k2.6");
    expect(html).toContain("14-day Elo history for claude-sonnet-4.6");
  });

  it("renders a dash for rows with <2 non-null history points", () => {
    const html = renderToStaticMarkup(
      <BenchmarksPanel
        data={makePayload()}
        error={undefined}
        isInitialLoading={false}
        eloHistory={{
          "kimi-k2.6": [null, null, 1400],
          "claude-sonnet-4.6": [null, null, null],
        }}
      />,
    );
    expect(html).toContain('title="Insufficient history"');
    // Dash glyph appears (using em-dash from the cell — narrow no-data signal)
    const insufficientCount = (
      html.match(/Insufficient history/g) ?? []
    ).length;
    expect(insufficientCount).toBe(2);
  });

  it("renders a SparklineMini for rows that have history AND a dash for rows that don't", () => {
    const html = renderToStaticMarkup(
      <BenchmarksPanel
        data={makePayload()}
        error={undefined}
        isInitialLoading={false}
        eloHistory={{
          "kimi-k2.6": [1390, 1395, 1400],
          // claude-sonnet-4.6 missing entirely from history map → empty placeholder.
        }}
      />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("14-day Elo history for kimi-k2.6");
    // The other row gets the empty placeholder, not the dash, because
    // the WHOLE history fetch hasn't returned a key for it (vs. having
    // a key with all-null which would be Insufficient).
    expect(html).not.toContain("14-day Elo history for claude-sonnet-4.6");
  });
});
