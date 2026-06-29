import { describe, expect, it } from "vitest";
import { buildProbeSpecs, freshnessBudget } from "@/lib/integrity/specs";
import { CRON_WORKFLOWS } from "@/lib/data/cron-health";

describe("freshnessBudget", () => {
  it("is 2x the cron's declared interval (no parallel truth)", () => {
    expect(freshnessBudget("globe-ingest")).toBe(
      CRON_WORKFLOWS["globe-ingest"].expectedIntervalMinutes * 2,
    );
  });
});

describe("buildProbeSpecs", () => {
  it("includes the globe and feed outputs", () => {
    const ids = buildProbeSpecs().map((s) => s.id);
    expect(ids).toContain("globe-events");
    expect(ids).toContain("feed");
  });

  it("derives the globe freshness budget from cron-health, not a literal", () => {
    const globe = buildProbeSpecs().find((s) => s.id === "globe-events")!;
    expect(globe.contract.maxAgeMinutes).toBe(freshnessBudget("globe-ingest"));
  });

  it("checks per-card provenance on the feed via sourceUrl", () => {
    const feed = buildProbeSpecs().find((s) => s.id === "feed")!;
    expect(feed.contract.provenanceField).toBe("sourceUrl");
  });

  it("honours an origin override (for preview deployments)", () => {
    const specs = buildProbeSpecs("https://preview.example.com");
    expect(specs.every((s) => s.url.startsWith("https://preview.example.com"))).toBe(
      true,
    );
  });

  it("globe extract reads points[]/polledAt and throws on a shape change", () => {
    const globe = buildProbeSpecs().find((s) => s.id === "globe-events")!;
    const out = globe.extract({
      polledAt: "2026-06-28T11:00:00.000Z",
      points: [{ lat: 1 }],
    });
    expect(out.observedAt).toBe("2026-06-28T11:00:00.000Z");
    expect(out.records).toHaveLength(1);
    expect(() => globe.extract({ nope: true })).toThrow();
  });
});
