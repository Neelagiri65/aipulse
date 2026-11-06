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

// Until 2026-11-04 every committed snapshot carried only NEW deltas (the previous-snapshot fetch
// found nothing — see benchmarks-ingest.ts), so prod had never rendered an arrow. This renders the
// committed payload itself, which now carries real movement.
// A frozen copy (2026-11-04), not data/benchmarks/lmarena-latest.json: the live file changes at
// every lmarena publish and some weeks carry no up arrow, which would turn this red on its own.
import committed from "../../../lib/data/__tests__/fixtures/lmarena-latest-2026-10-28.json";

describe("BenchmarksPanel — deltas from the committed snapshot", () => {
  const data = committed as BenchmarksPayload;
  const html = renderToStaticMarkup(
    <BenchmarksPanel data={data} error={undefined} isInitialLoading={false} />,
  );
  const rows = data.ok ? data.rows : [];

  it("draws an up arrow and a down arrow with the amount the payload carries", () => {
    const up = rows.find((r) => r.rankDelta.kind === "up");
    const down = rows.find((r) => r.rankDelta.kind === "down");
    expect(up && down).toBeTruthy();
    expect(html).toContain(`▲${(up!.rankDelta as { amount: number }).amount}`);
    expect(html).toContain(`▼${(down!.rankDelta as { amount: number }).amount}`);
  });

  it("draws a dash, not NEW, when there is no earlier board to compare with", () => {
    if (!data.ok) throw new Error("fixture not ok");
    const none = {
      ...data,
      meta: { ...data.meta, prevPublishDate: null },
      rows: data.rows.map((r) => ({ ...r, rankDelta: { kind: "none" as const }, eloDelta: { kind: "none" as const } })),
    } as BenchmarksPayload;
    const out = renderToStaticMarkup(<BenchmarksPanel data={none} error={undefined} isInitialLoading={false} />);
    expect(out).not.toContain(">NEW<");
    expect(out).toContain("No earlier board to compare with");
  });

  it("draws signed Elo changes", () => {
    const change = rows.find((r) => r.eloDelta.kind === "change");
    const amount = (change!.eloDelta as { amount: number }).amount;
    const sign = amount > 0 ? "\\+" : "−";
    expect(html).toMatch(new RegExp(`>${sign}(<!-- -->)?${Math.abs(amount)}<`));
  });
});
