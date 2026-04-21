import { describe, expect, it } from "vitest";
import { composeBenchmarksSection } from "@/lib/digest/sections/benchmarks";
import type { SnapshotBenchmarks } from "@/lib/data/snapshot";

function bm(top3: SnapshotBenchmarks["top3"], publishDate = "2026-04-22"): SnapshotBenchmarks {
  return { publishDate, top3 };
}

describe("composeBenchmarksSection", () => {
  it("degrades gracefully when today's data is missing", () => {
    const sec = composeBenchmarksSection({ today: null, yesterday: null });
    expect(sec.mode).toBe("quiet");
    expect(sec.items).toHaveLength(0);
    expect(sec.headline).toMatch(/unavailable/);
  });

  it("returns bootstrap when yesterday is null", () => {
    const sec = composeBenchmarksSection({
      today: bm([
        { rank: 1, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
        { rank: 2, modelName: "GPT-6", organization: "OpenAI", rating: 1490 },
        { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
      ]),
      yesterday: null,
    });
    expect(sec.mode).toBe("bootstrap");
    expect(sec.items).toHaveLength(3);
    expect(sec.items[0].headline).toBe("#1 Claude Opus 4.7");
  });

  it("surfaces rank changes in diff mode", () => {
    const sec = composeBenchmarksSection({
      today: bm([
        { rank: 1, modelName: "GPT-6", organization: "OpenAI", rating: 1505 },
        { rank: 2, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
        { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
      ]),
      yesterday: bm([
        { rank: 1, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
        { rank: 2, modelName: "GPT-6", organization: "OpenAI", rating: 1490 },
        { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
      ]),
    });
    expect(sec.mode).toBe("diff");
    expect(sec.items.some((i) => i.headline === "GPT-6" && i.detail!.includes("up 1"))).toBe(true);
    expect(sec.items.some((i) => i.headline === "Claude Opus 4.7" && i.detail!.includes("down 1"))).toBe(true);
  });

  it("surfaces new entrants and dropouts", () => {
    const sec = composeBenchmarksSection({
      today: bm([
        { rank: 1, modelName: "New Model", organization: "NewLab", rating: 1510 },
        { rank: 2, modelName: "GPT-6", organization: "OpenAI", rating: 1490 },
        { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
      ]),
      yesterday: bm([
        { rank: 1, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
        { rank: 2, modelName: "GPT-6", organization: "OpenAI", rating: 1490 },
        { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
      ]),
    });
    expect(sec.mode).toBe("diff");
    expect(sec.items.some((i) => i.headline.startsWith("New to top 3"))).toBe(true);
    expect(sec.items.some((i) => i.headline.startsWith("Dropped from top 3"))).toBe(true);
  });

  it("returns quiet mode with current top-3 tiles when nothing moved", () => {
    const top = [
      { rank: 1, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
      { rank: 2, modelName: "GPT-6", organization: "OpenAI", rating: 1490 },
      { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
    ];
    const sec = composeBenchmarksSection({ today: bm(top), yesterday: bm(top) });
    expect(sec.mode).toBe("quiet");
    expect(sec.items).toHaveLength(3);
  });

  it("always cites the LMArena leaderboard URL", () => {
    const sec = composeBenchmarksSection({ today: bm([]), yesterday: null });
    expect(sec.sourceUrls).toContain("https://lmarena.ai/leaderboard");
  });
});
