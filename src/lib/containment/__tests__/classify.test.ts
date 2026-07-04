import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildReport } from "@/lib/integrity/checks";
import { evaluate } from "@/lib/integrity/evaluate";
import { buildProbeSpecs } from "@/lib/integrity/specs";

import { classifyReport, probeErrorObservation } from "../classify";

/** Real production DTO captured from gawk.dev/api/feed on 2026-07-04. */
const feedFixture = JSON.parse(
  readFileSync(new URL("./fixtures/feed.json", import.meta.url), "utf8"),
) as { cards: Array<Record<string, unknown>>; lastComputed: string };

const feedSpec = buildProbeSpecs("https://gawk.dev").find(
  (s) => s.id === "feed",
);
if (!feedSpec) throw new Error("feed probe spec missing from buildProbeSpecs");

/** Fixed clock pinned just after the fixture was captured, so the real
 *  DTO is genuinely fresh under the real contract — forever. */
const NOW = Date.parse(feedFixture.lastComputed) + 60_000;

describe("classifyReport against the REAL prod feed DTO + real probe spec", () => {
  it("healthy production output classifies as pass", () => {
    const report = evaluate(feedSpec, feedFixture, NOW);
    expect(classifyReport(report)).toEqual({
      sourceId: "feed",
      outcome: "pass",
      reason: "",
    });
  });

  it("a card losing its provenance (sourceUrl) is a hard-fail — trust class", () => {
    const mutated = {
      ...feedFixture,
      cards: feedFixture.cards.map((c, i) =>
        i === 0 ? { ...c, sourceUrl: "" } : c,
      ),
    };
    const obs = classifyReport(evaluate(feedSpec, mutated, NOW));
    expect(obs.outcome).toBe("hard-fail");
    expect(obs.reason).toContain("provenance");
  });

  it("merely-old output is a soft-fail — availability class (S88 digest shape)", () => {
    const twelveHoursLater = NOW + 12 * 60 * 60_000;
    const obs = classifyReport(evaluate(feedSpec, feedFixture, twelveHoursLater));
    expect(obs.outcome).toBe("soft-fail");
    expect(obs.reason).toContain("freshness");
  });

  it("an UNDATED output is a hard-fail — a number we cannot date cannot ship", () => {
    const mutated = { ...feedFixture, lastComputed: "" };
    const obs = classifyReport(evaluate(feedSpec, mutated, NOW));
    expect(obs.outcome).toBe("hard-fail");
    expect(obs.reason).toContain("freshness");
  });

  it("schema drift (DTO no longer parses) is a hard-fail — S85/S91 endpoint-moved class", () => {
    const obs = classifyReport(evaluate(feedSpec, { unexpected: true }, NOW));
    expect(obs.outcome).toBe("hard-fail");
    expect(obs.reason).toContain("parse");
  });

  it("empty-but-dated output is a soft-fail — possibly quiet, gets hysteresis not instant grey", () => {
    const mutated = { ...feedFixture, cards: [] };
    const obs = classifyReport(evaluate(feedSpec, mutated, NOW));
    expect(obs.outcome).toBe("soft-fail");
    expect(obs.reason).toContain("non-empty");
  });
});

describe("classifyReport — synthetic reports for classes the feed spec cannot express", () => {
  const at = new Date(NOW).toISOString();

  it("fabrication is a hard-fail", () => {
    const report = buildReport({
      source: "globe-events",
      observedAt: at,
      checks: [
        {
          name: "not-fabricated",
          ok: false,
          severity: "critical",
          detail: "2 synthetic/simulated record(s) present",
        },
      ],
    });
    expect(classifyReport(report).outcome).toBe("hard-fail");
  });

  it("a breached pre-committed sanity range is a hard-fail — do not ship while investigating", () => {
    const report = buildReport({
      source: "openrouter",
      observedAt: at,
      checks: [
        { name: "sanity", ok: false, severity: "warn", detail: "69 above max 30" },
      ],
    });
    expect(classifyReport(report).outcome).toBe("hard-fail");
  });

  it("an unreachable witness is a SOFT-fail despite its critical severity — transient blips never instant-quarantine", () => {
    const report = buildReport({
      source: "daily-video",
      observedAt: at,
      checks: [
        {
          name: "reachable",
          ok: false,
          severity: "critical",
          detail: "fetch failed: timeout",
        },
      ],
    });
    expect(classifyReport(report).outcome).toBe("soft-fail");
  });

  it("hard beats soft when both fail, and the reason is the hard one", () => {
    const report = buildReport({
      source: "feed",
      observedAt: at,
      checks: [
        { name: "freshness", ok: false, severity: "stale", detail: "400m old" },
        {
          name: "provenance",
          ok: false,
          severity: "critical",
          detail: "3/40 records missing sourceUrl",
        },
      ],
    });
    const obs = classifyReport(report);
    expect(obs.outcome).toBe("hard-fail");
    expect(obs.reason).toContain("provenance");
  });

  it("an unknown future check id defaults to soft — new checks must opt IN to instant quarantine", () => {
    const report = buildReport({
      source: "feed",
      observedAt: at,
      checks: [
        { name: "brand-new-check", ok: false, severity: "critical", detail: "?" },
      ],
    });
    expect(classifyReport(report).outcome).toBe("soft-fail");
  });

  it("a failing ordering check (catalogue-fallback) is SOFT — degraded product, honest data", () => {
    const report = buildReport({
      source: "openrouter-rankings",
      observedAt: "2026-06-28T11:30:00.000Z",
      checks: [
        {
          name: "ordering",
          ok: false,
          severity: "warn",
          detail: 'ordering "catalogue-fallback" is not the real product (expected top-weekly | trending)',
        },
      ],
    });
    const obs = classifyReport(report);
    expect(obs.outcome).toBe("soft-fail");
    expect(obs.reason).toContain("catalogue-fallback");
  });

  it("probeErrorObservation wraps runner crashes as the state-preserving outcome", () => {
    expect(probeErrorObservation("feed", "redis down")).toEqual({
      sourceId: "feed",
      outcome: "probe-error",
      reason: "redis down",
    });
  });
});
