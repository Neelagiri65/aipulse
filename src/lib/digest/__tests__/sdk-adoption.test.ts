import { describe, expect, it } from "vitest";
import { composeSdkAdoptionSection } from "@/lib/digest/sections/sdk-adoption";
import type { SnapshotPackages } from "@/lib/data/snapshot";

describe("composeSdkAdoptionSection", () => {
  it("returns quiet when today is null (unavailable)", () => {
    const sec = composeSdkAdoptionSection({ today: null, yesterday: null });
    expect(sec.mode).toBe("quiet");
    expect(sec.items).toHaveLength(0);
  });

  it("returns bootstrap when yesterday is null and today has counters", () => {
    const today: SnapshotPackages = {
      pypi: [
        { name: "anthropic", lastDay: 100, lastWeek: 500, lastMonth: 2000 },
        { name: "openai", lastDay: 200, lastWeek: 1000, lastMonth: 4000 },
      ],
      npm: [{ name: "@anthropic-ai/sdk", lastDay: 50, lastWeek: 300, lastMonth: 1200 }],
    };
    const sec = composeSdkAdoptionSection({ today, yesterday: null });
    expect(sec.mode).toBe("bootstrap");
    expect(sec.items.length).toBeGreaterThan(0);
  });

  it("emits a panelHref deep-link to /panels/sdk-adoption?focus={pkgId} on each item (bootstrap)", () => {
    const today: SnapshotPackages = {
      pypi: [{ name: "transformers", lastDay: 500 }],
      npm: [{ name: "@anthropic-ai/sdk", lastDay: 100 }],
    };
    const sec = composeSdkAdoptionSection({ today, yesterday: null });
    const pypiItem = sec.items.find((i) => i.sourceLabel === "PyPI");
    const npmItem = sec.items.find((i) => i.sourceLabel === "npm");
    expect(pypiItem?.panelHref).toBe(
      "/panels/sdk-adoption?focus=pypi%3Atransformers",
    );
    expect(npmItem?.panelHref).toBe(
      "/panels/sdk-adoption?focus=npm%3A%40anthropic-ai%2Fsdk",
    );
  });

  it("emits a panelHref deep-link on each diff-mode mover", () => {
    const today: SnapshotPackages = {
      pypi: [{ name: "transformers", lastWeek: 100_000 }],
    };
    const yesterday: SnapshotPackages = {
      pypi: [{ name: "transformers", lastWeek: 90_000 }],
    };
    const sec = composeSdkAdoptionSection({ today, yesterday });
    expect(sec.mode).toBe("diff");
    const item = sec.items[0];
    expect(item.panelHref).toBe(
      "/panels/sdk-adoption?focus=pypi%3Atransformers",
    );
  });

  it("carries the PyPI aggregator caveat verbatim on PyPI items", () => {
    const today: SnapshotPackages = {
      pypi: [{ name: "anthropic", lastDay: 100, lastWeek: 500, lastMonth: 2000 }],
    };
    const sec = composeSdkAdoptionSection({ today, yesterday: null });
    const pypiItem = sec.items.find((i) => i.headline.startsWith("PyPI:"));
    expect(pypiItem).toBeDefined();
    expect(pypiItem!.caveat).toContain("pypistats.org is a third-party aggregator");
  });

  it("does not attach the PyPI caveat to non-PyPI items", () => {
    const today: SnapshotPackages = {
      npm: [{ name: "@anthropic-ai/sdk", lastDay: 50, lastWeek: 300, lastMonth: 1200 }],
    };
    const sec = composeSdkAdoptionSection({ today, yesterday: null });
    const npmItem = sec.items.find((i) => i.headline.startsWith("npm:"));
    expect(npmItem).toBeDefined();
    expect(npmItem!.caveat).toBeUndefined();
  });

  it("surfaces day-over-day deltas above the registry threshold in diff mode", () => {
    const today: SnapshotPackages = {
      pypi: [{ name: "anthropic", lastWeek: 10_000 }],
      npm: [{ name: "@anthropic-ai/sdk", lastWeek: 5_000 }],
    };
    const yesterday: SnapshotPackages = {
      pypi: [{ name: "anthropic", lastWeek: 5_000 }],
      npm: [{ name: "@anthropic-ai/sdk", lastWeek: 4_000 }],
    };
    const sec = composeSdkAdoptionSection({ today, yesterday });
    expect(sec.mode).toBe("diff");
    const pypi = sec.items.find((i) => i.headline.startsWith("PyPI:"));
    expect(pypi!.detail).toMatch(/\+/);
  });

  it("skips deltas below the registry-specific threshold", () => {
    const today: SnapshotPackages = {
      pypi: [{ name: "anthropic", lastWeek: 5_100 }],
    };
    const yesterday: SnapshotPackages = {
      pypi: [{ name: "anthropic", lastWeek: 5_000 }],
    };
    const sec = composeSdkAdoptionSection({ today, yesterday });
    expect(sec.mode).toBe("quiet");
    expect(sec.items).toHaveLength(0);
  });

  it("produces quiet mode when no registry has a meaningful delta", () => {
    const today: SnapshotPackages = { pypi: [] };
    const yesterday: SnapshotPackages = { pypi: [] };
    const sec = composeSdkAdoptionSection({ today, yesterday });
    expect(sec.mode).toBe("quiet");
  });
});
