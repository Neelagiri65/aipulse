import { describe, it, expect } from "vitest";
import type { GlobePoint } from "@/components/globe/Globe";
import type { ModelsResult, HuggingFaceModel } from "@/lib/data/fetch-models";
import type {
  BenchmarksPayload,
  ArenaRowWithDelta,
  RankDelta,
} from "@/lib/data/benchmarks-lmarena";
import {
  wireInsight,
  modelsInsight,
  benchmarksInsight,
  compactCount,
} from "@/lib/panels/insights";

// (0,0) is in the ocean and resolves to no city in the geocoder dictionary,
// so these fixtures exercise the type-breakdown path without coupling the
// assertion to the geocoder's city list (busiest suffix tested separately).
function ev(type: string): GlobePoint {
  return { lat: 0, lng: 0, color: "#fff", meta: { kind: "event", type } };
}

describe("wireInsight", () => {
  it("returns null when there are no live GH events", () => {
    expect(wireInsight([], 240)).toBeNull();
    // non-event overlay points (registry/lab/hn) don't count as live events
    const overlay: GlobePoint = { lat: 0, lng: 0, color: "#fff", meta: { kind: "lab" } };
    expect(wireInsight([overlay], 240)).toBeNull();
  });

  it("summarises the top event types, count-prefixed and pluralised", () => {
    const points = [
      ...Array.from({ length: 5 }, () => ev("PushEvent")),
      ...Array.from({ length: 3 }, () => ev("PullRequestEvent")),
      ev("IssuesEvent"),
    ];
    const insight = wireInsight(points, 240);
    expect(insight).not.toBeNull();
    expect(insight!.text).toBe("5 pushes · 3 PRs · 1 issue");
    expect(insight!.source).toBe("GitHub Events · last 240m");
  });

  it("caps the breakdown to the top 3 types", () => {
    const points = [
      ...Array.from({ length: 4 }, () => ev("PushEvent")),
      ...Array.from({ length: 3 }, () => ev("PullRequestEvent")),
      ...Array.from({ length: 2 }, () => ev("IssuesEvent")),
      ev("ReleaseEvent"),
    ];
    const insight = wireInsight(points, 60);
    expect(insight!.text).toBe("4 pushes · 3 PRs · 2 issues");
    expect(insight!.text).not.toContain("release");
    expect(insight!.source).toBe("GitHub Events · last 60m");
  });
});

function model(name: string, downloads: number, author: string): HuggingFaceModel {
  return {
    id: `${author}/${name}`,
    author,
    name,
    downloads,
    likes: 0,
    lastModified: "2026-06-01T00:00:00Z",
    pipelineTag: "text-generation",
    hubUrl: `https://huggingface.co/${author}/${name}`,
  };
}

function modelsResult(models: HuggingFaceModel[]): ModelsResult {
  return { ok: true, models, generatedAt: "2026-06-15T00:00:00Z" };
}

describe("modelsInsight", () => {
  it("returns null for missing/errored/empty payloads", () => {
    expect(modelsInsight(undefined)).toBeNull();
    expect(modelsInsight({ ok: false, models: [], generatedAt: "x" })).toBeNull();
    expect(modelsInsight(modelsResult([]))).toBeNull();
  });

  it("names the leader (listing order) and distinct org count", () => {
    const insight = modelsInsight(
      modelsResult([
        model("Qwen3-Max", 4_500_000, "Qwen"),
        model("Llama-4", 1_200_000, "meta-llama"),
        model("Qwen3-Mini", 900_000, "Qwen"),
      ]),
    );
    expect(insight!.text).toBe(
      "Most downloaded: Qwen3-Max · 4.5M downloads/30d · 2 orgs in top 3",
    );
    expect(insight!.source).toBe("HuggingFace · 30-day downloads");
  });

  it("uses singular 'org' when only one org is present", () => {
    const insight = modelsInsight(
      modelsResult([model("a", 1000, "solo"), model("b", 500, "solo")]),
    );
    expect(insight!.text).toContain("1 org in top 2");
  });
});

function arenaRow(
  modelName: string,
  rank: number,
  rating: number,
  rankDelta: RankDelta,
): ArenaRowWithDelta {
  return {
    rank,
    modelName,
    organization: "org",
    rating,
    ratingLower: rating - 5,
    ratingUpper: rating + 5,
    voteCount: 10000,
    category: "overall",
    leaderboardPublishDate: "2026-06-14",
    rankDelta,
    eloDelta: { kind: "same" },
  };
}

function benchPayload(rows: ArenaRowWithDelta[]): BenchmarksPayload {
  return {
    ok: true,
    rows,
    meta: {
      leaderboardPublishDate: "2026-06-14",
      prevPublishDate: "2026-06-07",
      totalVotes: 100000,
      staleDays: 0,
      fetchedAt: "2026-06-15T00:00:00Z",
    },
    sanity: { ok: true, warnings: [] },
  };
}

describe("benchmarksInsight", () => {
  it("returns null for missing/not-ok/empty payloads", () => {
    expect(benchmarksInsight(undefined)).toBeNull();
    expect(
      benchmarksInsight({ ok: false, reason: "down", rows: [], meta: null }),
    ).toBeNull();
  });

  it("surfaces the biggest rank climber with the comparison period", () => {
    const insight = benchmarksInsight(
      benchPayload([
        arenaRow("DeepSeek V4", 1, 1450, { kind: "same" }),
        arenaRow("Gemini 3 Pro", 2, 1440, { kind: "up", amount: 4 }),
        arenaRow("Claude Opus 4.8", 3, 1435, { kind: "up", amount: 2 }),
      ]),
    );
    expect(insight!.text).toBe("Biggest climber: Gemini 3 Pro ▲4 ranks to #2");
    expect(insight!.source).toBe("Chatbot Arena · 2026-06-14 vs 2026-06-07");
  });

  it("uses singular 'rank' for a one-step climb", () => {
    const insight = benchmarksInsight(
      benchPayload([
        arenaRow("A", 1, 1400, { kind: "same" }),
        arenaRow("B", 2, 1390, { kind: "up", amount: 1 }),
      ]),
    );
    expect(insight!.text).toBe("Biggest climber: B ▲1 rank to #2");
  });

  it("falls back to the #1 hold line when nothing climbed", () => {
    const insight = benchmarksInsight(
      benchPayload([
        arenaRow("DeepSeek V4", 1, 1450.4, { kind: "same" }),
        arenaRow("Gemini 3 Pro", 2, 1440, { kind: "down", amount: 1 }),
      ]),
    );
    expect(insight!.text).toBe("DeepSeek V4 holds #1 at 1450 Elo");
  });

  it("drops the comparison clause when there is no previous snapshot", () => {
    const payload = benchPayload([arenaRow("A", 1, 1400, { kind: "same" })]);
    (payload as { meta: { prevPublishDate: string | null } }).meta.prevPublishDate =
      null;
    expect(benchmarksInsight(payload)!.source).toBe("Chatbot Arena · 2026-06-14");
  });
});

describe("compactCount", () => {
  it("formats thousands, millions, billions and trims trailing .0", () => {
    expect(compactCount(999)).toBe("999");
    expect(compactCount(1000)).toBe("1K");
    expect(compactCount(1234)).toBe("1.2K");
    expect(compactCount(4_500_000)).toBe("4.5M");
    expect(compactCount(2_000_000_000)).toBe("2B");
  });

  it("guards against negative/non-finite input", () => {
    expect(compactCount(-5)).toBe("0");
    expect(compactCount(NaN)).toBe("0");
  });
});
