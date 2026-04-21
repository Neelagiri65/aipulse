import { describe, expect, it } from "vitest";
import { composeLabsSection } from "@/lib/digest/sections/labs";
import type { SnapshotLabEntry } from "@/lib/data/snapshot";

function lab(overrides: Partial<SnapshotLabEntry>): SnapshotLabEntry {
  return {
    id: "lab",
    displayName: "Lab",
    kind: "industry",
    city: "SF",
    country: "USA",
    total: 0,
    byType: {},
    stale: false,
    ...overrides,
  };
}

describe("composeLabsSection", () => {
  it("emits quiet when today is empty", () => {
    const sec = composeLabsSection({ today: [], yesterday: null });
    expect(sec.mode).toBe("quiet");
    expect(sec.items).toHaveLength(0);
  });

  it("emits bootstrap (top-5) when yesterday is null", () => {
    const today = [
      lab({ id: "a", displayName: "A", total: 10 }),
      lab({ id: "b", displayName: "B", total: 20 }),
      lab({ id: "c", displayName: "C", total: 30 }),
    ];
    const sec = composeLabsSection({ today, yesterday: null });
    expect(sec.mode).toBe("bootstrap");
    expect(sec.items).toHaveLength(3);
  });

  it("surfaces movers whose delta exceeds the threshold", () => {
    const today = [lab({ id: "a", displayName: "A", total: 50 })];
    const yesterday = [lab({ id: "a", displayName: "A", total: 40 })];
    const sec = composeLabsSection({ today, yesterday });
    expect(sec.mode).toBe("diff");
    expect(sec.items[0].headline).toBe("A");
    expect(sec.items[0].detail).toMatch(/\+10 events/);
  });

  it("drops movers whose delta is below the threshold", () => {
    const today = [lab({ id: "a", displayName: "A", total: 43 })];
    const yesterday = [lab({ id: "a", displayName: "A", total: 40 })];
    const sec = composeLabsSection({ today, yesterday });
    expect(sec.mode).toBe("quiet");
  });

  it("surfaces new movers not in yesterday", () => {
    const today = [lab({ id: "a", displayName: "A", total: 10 })];
    const yesterday = [lab({ id: "b", displayName: "B", total: 10 })];
    const sec = composeLabsSection({ today, yesterday });
    expect(sec.mode).toBe("diff");
    expect(sec.items.some((i) => i.headline.startsWith("New mover"))).toBe(true);
    expect(sec.items.some((i) => i.headline.startsWith("Dropped off"))).toBe(true);
  });

  it("adds 'partial view' caveat to stale labs", () => {
    const today = [lab({ id: "a", displayName: "A", total: 50, stale: true })];
    const yesterday = [lab({ id: "a", displayName: "A", total: 40 })];
    const sec = composeLabsSection({ today, yesterday });
    expect(sec.items[0].detail).toContain("partial view");
  });

  it("cites the /labs hash URL in sourceUrls", () => {
    const sec = composeLabsSection({ today: [lab({ total: 1 })], yesterday: null });
    expect(sec.sourceUrls).toContain("https://aipulse-pi.vercel.app/#labs");
  });
});
