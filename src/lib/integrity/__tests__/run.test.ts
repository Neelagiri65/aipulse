import { describe, expect, it } from "vitest";
import { runProbes, summarise, type RunnableSpec } from "@/lib/integrity/run";
import type { Fetcher } from "@/lib/integrity/run";
import type { IntegrityReport } from "@/lib/integrity/checks";

const NOW = Date.parse("2026-06-28T12:00:00.000Z");

const feedSpec: RunnableSpec = {
  id: "feed",
  url: "https://gawk.dev/api/feed",
  extract: (p) => {
    const o = p as { cards?: unknown[]; lastComputed?: string };
    return {
      observedAt: o.lastComputed ?? null,
      records: (o.cards ?? []) as Array<Record<string, unknown>>,
    };
  },
  contract: { maxAgeMinutes: 180, floor: 1, provenanceField: "type" },
};

/** Build a fetcher from a url→payload map. Unknown urls throw (simulates
 *  an unreachable endpoint). */
function fakeFetcher(map: Record<string, unknown>): Fetcher {
  return async (url: string) => {
    if (!(url in map)) throw new Error(`no fake for ${url}`);
    return map[url];
  };
}

describe("runProbes", () => {
  it("evaluates each spec against its fetched payload", async () => {
    const fetcher = fakeFetcher({
      "https://gawk.dev/api/feed": {
        lastComputed: "2026-06-28T11:40:00.000Z",
        cards: [{ type: "TOOL_ALERT" }, { type: "SDK_TREND" }],
      },
    });
    const [report] = await runProbes([feedSpec], fetcher, NOW);
    expect(report.source).toBe("feed");
    expect(report.verdict).toBe("OK");
  });

  it("turns a fetch failure into a critical 'reachable' report, not a throw", async () => {
    const fetcher: Fetcher = async () => {
      throw new Error("ECONNREFUSED");
    };
    const [report] = await runProbes([feedSpec], fetcher, NOW);
    expect(report.verdict).toBe("FAIL");
    expect(report.checks[0]).toMatchObject({ name: "reachable", ok: false });
    expect(report.checks[0].detail).toContain("ECONNREFUSED");
  });

  it("isolates failures — one dead endpoint does not blind the others", async () => {
    const okSpec: RunnableSpec = {
      ...feedSpec,
      id: "globe-events",
      url: "https://gawk.dev/api/globe-events",
    };
    const fetcher = fakeFetcher({
      "https://gawk.dev/api/globe-events": {
        lastComputed: "2026-06-28T11:50:00.000Z",
        cards: [{ type: "x" }],
      },
      // feed url intentionally absent → that fetch throws
    });
    const reports = await runProbes([feedSpec, okSpec], fetcher, NOW);
    expect(reports.map((r) => `${r.source}:${r.verdict}`)).toEqual([
      "feed:FAIL",
      "globe-events:OK",
    ]);
  });
});

describe("summarise", () => {
  const rep = (
    verdict: IntegrityReport["verdict"],
    source = "x",
  ): IntegrityReport => ({ source, verdict, checks: [], observedAt: "" });

  it("rolls up to OK when everything is OK", () => {
    const s = summarise([rep("OK"), rep("OK")]);
    expect(s.verdict).toBe("OK");
    expect(s.failing).toHaveLength(0);
    expect(s.counts.OK).toBe(2);
  });

  it("worst verdict wins (FAIL over STALE over DEGRADED)", () => {
    expect(summarise([rep("DEGRADED"), rep("STALE")]).verdict).toBe("STALE");
    expect(summarise([rep("STALE"), rep("FAIL")]).verdict).toBe("FAIL");
  });

  it("collects the failing reports for alert routing", () => {
    const s = summarise([rep("OK", "a"), rep("FAIL", "b"), rep("STALE", "c")]);
    expect(s.failing.map((r) => r.source)).toEqual(["b", "c"]);
    expect(s.counts).toMatchObject({ OK: 1, FAIL: 1, STALE: 1, DEGRADED: 0 });
  });
});
