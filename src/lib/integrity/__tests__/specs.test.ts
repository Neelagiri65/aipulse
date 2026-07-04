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

  it("openrouter spec: registry-backed sanity range, ordering contract, honest witness", () => {
    const spec = buildProbeSpecs().find((s) => s.id === "openrouter-rankings")!;
    expect(spec.contract.maxAgeMinutes).toBe(freshnessBudget("openrouter-rankings"));
    expect(spec.contract.expectedOrdering).toEqual(["top-weekly", "trending"]);
    expect(spec.contract.expectedMin).toBe(20);
    expect(spec.contract.expectedMax).toBe(150);
    const out = spec.extract({
      ordering: "catalogue-fallback",
      generatedAt: "2026-07-04T06:00:00.000Z",
      rows: [{ slug: "a" }],
    });
    expect(out.ordering).toBe("catalogue-fallback");
    expect(out.observedAt).toBe("2026-07-04T06:00:00.000Z");
    expect(() => spec.extract({ ordering: "top-weekly" })).toThrow();
  });

  it("sdk-adoption spec: freshness witnessed by newest per-package fetchedAt, never assembly time", () => {
    const spec = buildProbeSpecs().find((s) => s.id === "sdk-adoption")!;
    const out = spec.extract({
      generatedAt: "2026-07-04T12:00:00.000Z", // self-clocking — must be ignored
      packages: [
        { latest: { fetchedAt: "2026-07-01T00:00:00.000Z" } },
        { latest: { fetchedAt: "2026-07-03T06:00:00.000Z" } },
        { latest: { fetchedAt: null } },
      ],
    });
    expect(out.observedAt).toBe("2026-07-03T06:00:00.000Z");
    expect(out.records).toHaveLength(3);
    // No package has ever been fetched -> no witness -> null (stale, honest).
    const empty = spec.extract({ packages: [{ latest: { fetchedAt: null } }] });
    expect(empty.observedAt).toBeNull();
    expect(() => spec.extract({ nope: true })).toThrow();
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
