import { describe, expect, it } from "vitest";
import { composeModelUsageSection } from "@/lib/digest/sections/model-usage";
import type { ModelUsageSnapshotRow } from "@/lib/data/openrouter-types";

function mkRow(date: string, slugs: string[]): ModelUsageSnapshotRow {
  return { date, ordering: "top-weekly", slugs };
}

function snapshotsFor(history: Array<[string, string[]]>): Record<string, ModelUsageSnapshotRow> {
  const out: Record<string, ModelUsageSnapshotRow> = {};
  for (const [date, slugs] of history) {
    out[date] = mkRow(date, slugs);
  }
  return out;
}

describe("composeModelUsageSection — gating", () => {
  it("returns null when fewer than 7 distinct days are present", () => {
    const snapshots = snapshotsFor([
      ["2026-04-20", ["a/x", "b/y"]],
      ["2026-04-21", ["a/x", "b/y"]],
      ["2026-04-22", ["a/x", "b/y"]],
      ["2026-04-23", ["a/x", "b/y"]],
      ["2026-04-24", ["a/x", "b/y"]],
      ["2026-04-25", ["a/x", "b/y"]],
    ]);
    const section = composeModelUsageSection({ snapshots, today: "2026-04-25" });
    expect(section).toBeNull();
  });

  it("returns null when today's snapshot is absent", () => {
    const snapshots = snapshotsFor([
      ["2026-04-19", ["a/x", "b/y"]],
      ["2026-04-20", ["a/x", "b/y"]],
      ["2026-04-21", ["a/x", "b/y"]],
      ["2026-04-22", ["a/x", "b/y"]],
      ["2026-04-23", ["a/x", "b/y"]],
      ["2026-04-24", ["a/x", "b/y"]],
      ["2026-04-25", ["a/x", "b/y"]],
    ]);
    const section = composeModelUsageSection({ snapshots, today: "2026-04-26" });
    expect(section).toBeNull();
  });

  it("returns null when today's snapshot has zero slugs", () => {
    const snapshots = snapshotsFor([
      ["2026-04-19", ["a/x"]],
      ["2026-04-20", ["a/x"]],
      ["2026-04-21", ["a/x"]],
      ["2026-04-22", ["a/x"]],
      ["2026-04-23", ["a/x"]],
      ["2026-04-24", ["a/x"]],
      ["2026-04-25", ["a/x"]],
      ["2026-04-26", []],
    ]);
    const section = composeModelUsageSection({ snapshots, today: "2026-04-26" });
    expect(section).toBeNull();
  });
});

describe("composeModelUsageSection — content", () => {
  const baseHistory: Array<[string, string[]]> = [
    ["2026-04-19", ["a/king", "x/mover", "b/queen", "y/decliner", "c/static"]],
    ["2026-04-20", ["a/king", "x/mover", "b/queen", "y/decliner", "c/static"]],
    ["2026-04-21", ["a/king", "x/mover", "b/queen", "y/decliner", "c/static"]],
    ["2026-04-22", ["a/king", "x/mover", "b/queen", "y/decliner", "c/static"]],
    ["2026-04-23", ["a/king", "x/mover", "b/queen", "y/decliner", "c/static"]],
    ["2026-04-24", ["a/king", "x/mover", "b/queen", "y/decliner", "c/static"]],
    ["2026-04-25", ["a/king", "x/mover", "b/queen", "y/decliner", "c/static"]],
    // Today: x/mover climbs from #2 → #1 (Δ +1, biggest mover);
    //        y/decliner falls from #4 → #6 (Δ -2, biggest decliner — beats
    //        a/king's tie-break with the bigger drop).
    [
      "2026-04-26",
      ["x/mover", "a/king", "b/queen", "c/static", "z/new", "y/decliner"],
    ],
  ];

  it("emits a section with mover, decliner, and current top-3", () => {
    const section = composeModelUsageSection({
      snapshots: snapshotsFor(baseHistory),
      today: "2026-04-26",
    });
    expect(section).not.toBeNull();
    expect(section!.id).toBe("model-usage");
    expect(section!.mode).toBe("diff");
    expect(section!.items.length).toBe(2 + 3); // mover + decliner + top-3
    expect(section!.items[0].headline).toMatch(/x\/mover.*climbed.*\+1.*#1/);
    expect(section!.items[1].headline).toMatch(/y\/decliner.*slipped.*-2.*#6/);
    expect(section!.items[2].headline).toBe("#1 x/mover");
    expect(section!.items[3].headline).toBe("#2 a/king");
    expect(section!.items[4].headline).toBe("#3 b/queen");
  });

  it("encodes the panelHref deep-link for each item", () => {
    const section = composeModelUsageSection({
      snapshots: snapshotsFor(baseHistory),
      today: "2026-04-26",
    });
    for (const item of section!.items) {
      expect(item.panelHref).toMatch(/^\/panels\/model-usage\?focus=/);
    }
    // Encoding lives in the slug part — slash is %2F.
    expect(section!.items[0].panelHref).toContain("x%2Fmover");
  });

  it("attaches the canonical caveat to the first item only", () => {
    const section = composeModelUsageSection({
      snapshots: snapshotsFor(baseHistory),
      today: "2026-04-26",
    });
    expect(section!.items[0].caveat).toMatch(/OpenRouter request volume/);
    for (let i = 1; i < section!.items.length; i++) {
      expect(section!.items[i].caveat).toBeUndefined();
    }
  });

  it("falls back to the older snapshot when 7d-ago is missing (cron-skip tolerance)", () => {
    // Drop the exact 7d-back day; composer should walk to the day-8 bin.
    const history = [...baseHistory].filter(([d]) => d !== "2026-04-19");
    history.unshift(["2026-04-18", ["a/king", "x/mover", "b/queen", "y/decliner", "c/static"]]);
    const section = composeModelUsageSection({
      snapshots: snapshotsFor(history),
      today: "2026-04-26",
    });
    expect(section).not.toBeNull();
    expect(section!.items[0].detail).toMatch(/2026-04-18/);
  });

  it("excludes new entrants from movers (no 7d-prior position)", () => {
    const history: Array<[string, string[]]> = [
      ["2026-04-19", ["a/king", "b/queen"]],
      ["2026-04-20", ["a/king", "b/queen"]],
      ["2026-04-21", ["a/king", "b/queen"]],
      ["2026-04-22", ["a/king", "b/queen"]],
      ["2026-04-23", ["a/king", "b/queen"]],
      ["2026-04-24", ["a/king", "b/queen"]],
      ["2026-04-25", ["a/king", "b/queen"]],
      // brand-new slug appears at #1 today
      ["2026-04-26", ["new/entrant", "a/king", "b/queen"]],
    ];
    const section = composeModelUsageSection({
      snapshots: snapshotsFor(history),
      today: "2026-04-26",
    });
    expect(section).not.toBeNull();
    // The new entrant appears in top-3 but never in the mover slot.
    const moverHeadline = section!.items[0].headline;
    expect(moverHeadline).not.toContain("new/entrant");
    expect(section!.items.some((i) => i.headline === "#1 new/entrant")).toBe(true);
  });

  it("composes the section headline with #1 + biggest mover", () => {
    const section = composeModelUsageSection({
      snapshots: snapshotsFor(baseHistory),
      today: "2026-04-26",
    });
    expect(section!.headline).toContain("x/mover holds #1");
    expect(section!.headline).toContain("biggest drop");
  });

  it("emits sourceUrls pointing to OpenRouter rankings page", () => {
    const section = composeModelUsageSection({
      snapshots: snapshotsFor(baseHistory),
      today: "2026-04-26",
    });
    expect(section!.sourceUrls).toEqual(["https://openrouter.ai/rankings"]);
  });
});
