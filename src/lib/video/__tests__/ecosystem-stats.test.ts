/**
 * The daily video's hero row (`SOURCES · CRONS · AI LABS`) must carry
 * counts that trace to something real. Until this helper existed, the
 * fetch script hardcoded `sources: 40` and `crons: 22` (the registry had
 * 43, cron-health reported 25) and invented `labs: 38` whenever the labs
 * fetch failed. A stat we could not read is `null`, and the hero omits it;
 * it never shows a stand-in number.
 */
import { describe, expect, it } from "vitest";

import { buildEcosystemStats } from "@/lib/video/ecosystem-stats";

const byCountry = {
  US: { current24h: 120 },
  GB: { current24h: 30 },
  DE: {},
};

describe("buildEcosystemStats", () => {
  it("takes the source count from the registry, not a literal", () => {
    const s = buildEcosystemStats({
      verifiedSourceCount: 43,
      cronHealth: { total: 25 },
      labs: [{}, {}, {}],
      byCountry,
    });
    expect(s.sources).toBe(43);
    expect(s.crons).toBe(25);
    expect(s.labs).toBe(3);
  });

  it("reports null crons when cron-health could not be read", () => {
    const s = buildEcosystemStats({
      verifiedSourceCount: 43,
      cronHealth: null,
      labs: [{}],
      byCountry,
    });
    expect(s.crons).toBeNull();
  });

  it("reports null labs when the labs fetch failed — never a stand-in", () => {
    const s = buildEcosystemStats({
      verifiedSourceCount: 43,
      cronHealth: { total: 25 },
      labs: null,
      byCountry,
    });
    expect(s.labs).toBeNull();
  });

  it("reports an honest zero when the labs fetch succeeded but was empty", () => {
    const s = buildEcosystemStats({
      verifiedSourceCount: 43,
      cronHealth: { total: 25 },
      labs: [],
      byCountry,
    });
    expect(s.labs).toBe(0);
  });

  it("sums 24h events and counts countries from the regional payload", () => {
    const s = buildEcosystemStats({
      verifiedSourceCount: 43,
      cronHealth: { total: 25 },
      labs: [],
      byCountry,
    });
    expect(s.totalEvents).toBe(150);
    expect(s.activeCountries).toBe(3);
  });

  it("treats a cron-health payload without a numeric total as unreadable", () => {
    const s = buildEcosystemStats({
      verifiedSourceCount: 43,
      cronHealth: { total: Number.NaN },
      labs: [],
      byCountry,
    });
    expect(s.crons).toBeNull();
  });
});
