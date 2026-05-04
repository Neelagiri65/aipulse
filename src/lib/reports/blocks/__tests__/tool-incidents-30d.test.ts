import { describe, expect, it } from "vitest";
import { loadToolIncidents30dBlock } from "@/lib/reports/blocks/tool-incidents-30d";
import type { DailySnapshot, SnapshotTool } from "@/lib/data/snapshot";

function snap(
  date: string,
  tools: SnapshotTool[],
  capturedAt = `${date}T04:00:00Z`,
): DailySnapshot {
  return {
    date,
    capturedAt,
    sources: { total: 0, verified: 0, pending: 0 },
    registry: null,
    events24h: null,
    tools,
    benchmarks: null,
    packages: null,
    labs24h: null,
    failures: [],
  };
}

const FIXED_NOW = () => new Date("2026-05-04T00:00:00.000Z");

function days(n: number, fn: (date: string, i: number) => DailySnapshot): DailySnapshot[] {
  const out: DailySnapshot[] = [];
  const today = Date.UTC(2026, 4, 4);
  for (let i = 0; i < n; i += 1) {
    const d = new Date(today - i * 24 * 60 * 60 * 1000);
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push(fn(`${yy}-${mm}-${dd}`, i));
  }
  return out;
}

describe("loadToolIncidents30dBlock — happy path", () => {
  it("aggregates incident-days per tool over the window, sorted desc", () => {
    const snapshots = days(7, (date, i) =>
      snap(date, [
        { id: "anthropic", status: "operational", activeIncidents: i % 2 === 0 ? 1 : 0 },
        { id: "openai", status: "operational", activeIncidents: 2 },
        { id: "vercel", status: "operational", activeIncidents: 0 },
      ]),
    );
    const result = loadToolIncidents30dBlock({
      snapshots,
      windowDays: 7,
      now: FIXED_NOW,
    });
    // openai: 2*7 = 14, anthropic: 4 (days 0,2,4,6), vercel excluded.
    expect(result.rows.map((r) => r.label)).toEqual(["openai", "anthropic"]);
    expect(result.rows[0].value).toBe("14 incident-days");
    expect(result.rows[1].value).toBe("4 incident-days");
  });

  it("uses the canonical status-page URL + hostname for known tool ids", () => {
    const snapshots = days(2, (date) =>
      snap(date, [
        { id: "anthropic", status: "operational", activeIncidents: 1 },
      ]),
    );
    const result = loadToolIncidents30dBlock({
      snapshots,
      windowDays: 7,
      now: FIXED_NOW,
    });
    expect(result.rows[0].sourceUrl).toBe("https://status.anthropic.com");
    expect(result.rows[0].sourceLabel).toBe("status.anthropic.com");
  });

  it("falls back to a Gawk-sources placeholder for unknown tool ids", () => {
    const snapshots = days(2, (date) =>
      snap(date, [
        { id: "future-tool", status: "operational", activeIncidents: 1 },
      ]),
    );
    const result = loadToolIncidents30dBlock({
      snapshots,
      windowDays: 7,
      now: FIXED_NOW,
    });
    expect(result.rows[0].sourceUrl).toBe("https://gawk.dev/sources");
    expect(result.rows[0].sourceLabel).toBe("Gawk sources");
  });

  it("renders singular vs plural unit correctly (1 incident-day vs N incident-days)", () => {
    const snapshots = days(2, (date) =>
      snap(date, [
        { id: "anthropic", status: "operational", activeIncidents: 0 },
      ]),
    );
    snapshots[0].tools[0].activeIncidents = 1;
    const result = loadToolIncidents30dBlock({
      snapshots,
      windowDays: 7,
      now: FIXED_NOW,
    });
    expect(result.rows[0].value).toBe("1 incident-day");
  });
});

describe("loadToolIncidents30dBlock — sanity + edge cases", () => {
  it("returns rows: [] + sanity warning when no snapshot is in window", () => {
    const result = loadToolIncidents30dBlock({
      snapshots: [],
      windowDays: 30,
      now: FIXED_NOW,
    });
    expect(result.rows).toEqual([]);
    expect(result.sanityWarnings[0]).toContain("bootstrap mode");
  });

  it("warns reader-facing when fewer than half the expected snapshots are present", () => {
    const snapshots = days(5, (date) =>
      snap(date, [
        { id: "anthropic", status: "operational", activeIncidents: 1 },
      ]),
    );
    const result = loadToolIncidents30dBlock({
      snapshots,
      windowDays: 30,
      now: FIXED_NOW,
    });
    // 5 < 30/2 = 15 → caveat fires. Pin the reader-facing phrasing
    // (S62f) — should NOT mention internal "expected snapshot count"
    // framing, SHOULD say "minimum, not a complete count".
    const warning = result.sanityWarnings[0];
    expect(warning).toContain("Based on 5 days of captured snapshots");
    expect(warning).toContain("minimum, not a complete count");
    expect(warning).not.toContain("undercount");
  });

  it("returns rows: [] when no tool had any incident in the window", () => {
    const snapshots = days(7, (date) =>
      snap(date, [
        { id: "anthropic", status: "operational", activeIncidents: 0 },
        { id: "openai", status: "operational", activeIncidents: 0 },
      ]),
    );
    const result = loadToolIncidents30dBlock({
      snapshots,
      windowDays: 7,
      now: FIXED_NOW,
    });
    expect(result.rows).toEqual([]);
  });

  it("excludes snapshots outside the window cutoff", () => {
    // 1 snapshot today, 1 snapshot 60 days ago. 30-day window → only today counts.
    const today = "2026-05-04";
    const old = "2026-03-05";
    const snapshots = [
      snap(today, [
        { id: "anthropic", status: "operational", activeIncidents: 1 },
      ]),
      snap(old, [
        { id: "openai", status: "operational", activeIncidents: 5 },
      ]),
    ];
    const result = loadToolIncidents30dBlock({
      snapshots,
      windowDays: 30,
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label)).toEqual(["anthropic"]);
  });

  it("respects topN cap", () => {
    const snapshots = days(2, (date) =>
      snap(date, [
        { id: "a", status: "operational", activeIncidents: 1 },
        { id: "b", status: "operational", activeIncidents: 2 },
        { id: "c", status: "operational", activeIncidents: 3 },
        { id: "d", status: "operational", activeIncidents: 4 },
      ]),
    );
    const result = loadToolIncidents30dBlock({
      snapshots,
      windowDays: 7,
      topN: 2,
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label)).toEqual(["d", "c"]);
  });
});
