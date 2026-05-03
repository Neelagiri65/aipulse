import { describe, expect, it } from "vitest";

import type { DailySnapshot, SnapshotPackages } from "@/lib/data/snapshot";
import type { ModelUsageSnapshotRow } from "@/lib/data/openrouter-types";
import {
  deriveInferences,
  detectBenchmarkLeaderChange,
  detectBenchmarkLeaderStreak,
  detectOpenRouterFirstTimeOpenWeight,
  detectOpenWeightTopFiveMovement,
  detectSdkStreaks,
  detectToolHealthCleanStreak,
  INFERENCE_MAX,
  MIN_HISTORY_FOR_STREAKS,
} from "@/lib/digest/inference";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkSnap(
  date: string,
  overrides: Partial<DailySnapshot> = {},
): DailySnapshot {
  return {
    date,
    capturedAt: `${date}T08:00:00Z`,
    sources: { total: 38, verified: 32, pending: 6 },
    registry: null,
    events24h: null,
    tools: [
      { id: "openai", status: "operational", activeIncidents: 0 },
      { id: "anthropic", status: "operational", activeIncidents: 0 },
      { id: "github", status: "operational", activeIncidents: 0 },
    ],
    benchmarks: {
      publishDate: date,
      top3: [
        { rank: 1, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
        { rank: 2, modelName: "GPT-6", organization: "OpenAI", rating: 1490 },
        { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
      ],
    },
    packages: null,
    labs24h: [],
    failures: [],
    ...overrides,
  };
}

function mkPackages(torchLastWeek: number): SnapshotPackages {
  return {
    pypi: [
      { name: "torch", lastWeek: torchLastWeek },
      { name: "transformers", lastWeek: 1_000_000 },
      { name: "anthropic", lastWeek: 500_000 },
      { name: "openai", lastWeek: 800_000 },
      { name: "langchain", lastWeek: 300_000 },
      { name: "huggingface-hub", lastWeek: 600_000 },
      { name: "diffusers", lastWeek: 200_000 },
    ],
  };
}

function mkOrSnap(date: string, slugs: string[]): ModelUsageSnapshotRow {
  return { date, ordering: "top-weekly", slugs };
}

// ---------------------------------------------------------------------------
// deriveInferences — top-level orchestration
// ---------------------------------------------------------------------------

describe("deriveInferences", () => {
  it("returns empty array when history is shorter than MIN_HISTORY_FOR_STREAKS", () => {
    const result = deriveInferences({
      history: [mkSnap("2026-05-03"), mkSnap("2026-05-02")],
    });
    expect(result).toEqual([]);
    // Floor is 3, so 2 entries definitively returns nothing.
    expect(MIN_HISTORY_FOR_STREAKS).toBeGreaterThanOrEqual(3);
  });

  it("returns at most INFERENCE_MAX lines", () => {
    // Cook a history that triggers many candidate rules at once.
    const today = "2026-05-03";
    const history = [
      mkSnap(today, {
        packages: mkPackages(100), // smallest → triggers torch declined
        benchmarks: {
          publishDate: today,
          top3: [
            { rank: 1, modelName: "GPT-7", organization: "OpenAI", rating: 1510 },
            { rank: 2, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
            { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
          ],
        },
      }),
      mkSnap("2026-05-02", { packages: mkPackages(200) }),
      mkSnap("2026-05-01", { packages: mkPackages(300) }),
      mkSnap("2026-04-30", { packages: mkPackages(400) }),
    ];
    const result = deriveInferences({ history, incidentCount24h: 0 });
    expect(result.length).toBeLessThanOrEqual(INFERENCE_MAX);
  });

  it("prefers higher-priority rules — benchmark change ranks above tool-health-clean", () => {
    const history: DailySnapshot[] = [
      mkSnap("2026-05-03", {
        benchmarks: {
          publishDate: "2026-05-03",
          top3: [
            { rank: 1, modelName: "GPT-7", organization: "OpenAI", rating: 1510 },
            { rank: 2, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
            { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
          ],
        },
      }),
      mkSnap("2026-05-02"),
      mkSnap("2026-05-01"),
      mkSnap("2026-04-30"),
      mkSnap("2026-04-29"),
      mkSnap("2026-04-28"),
      mkSnap("2026-04-27"),
    ];
    const result = deriveInferences({ history, incidentCount24h: 0 });
    expect(result[0]).toMatch(/New #1 on LMArena/);
  });
});

// ---------------------------------------------------------------------------
// Per-rule detail
// ---------------------------------------------------------------------------

describe("detectBenchmarkLeaderChange", () => {
  it("emits a line when today's #1 differs from yesterday's", () => {
    const result = detectBenchmarkLeaderChange([
      mkSnap("2026-05-03", {
        benchmarks: {
          publishDate: "2026-05-03",
          top3: [{ rank: 1, modelName: "GPT-7", organization: "OpenAI", rating: 1510 }],
        },
      }),
      mkSnap("2026-05-02"),
    ]);
    expect(result).toMatch(/New #1.*GPT-7.*overtook.*Claude Opus 4\.7/);
  });

  it("returns null when today's #1 equals yesterday's", () => {
    const result = detectBenchmarkLeaderChange([
      mkSnap("2026-05-03"),
      mkSnap("2026-05-02"),
    ]);
    expect(result).toBeNull();
  });
});

describe("detectBenchmarkLeaderStreak", () => {
  it("emits a streak line at 7 consecutive snapshots", () => {
    const seven = Array.from({ length: 7 }, (_, i) =>
      mkSnap(`2026-05-${String(10 - i).padStart(2, "0")}`),
    );
    const result = detectBenchmarkLeaderStreak(seven);
    expect(result).toMatch(/Claude Opus 4\.7 holds #1.*7th consecutive/);
  });

  it("returns null below the 7-snapshot floor", () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      mkSnap(`2026-05-${String(10 - i).padStart(2, "0")}`),
    );
    expect(detectBenchmarkLeaderStreak(six)).toBeNull();
  });
});

describe("detectSdkStreaks", () => {
  it("detects monotonic decline of length 3", () => {
    const history = [
      mkSnap("2026-05-03", { packages: mkPackages(100) }),
      mkSnap("2026-05-02", { packages: mkPackages(200) }),
      mkSnap("2026-05-01", { packages: mkPackages(300) }),
    ];
    const result = detectSdkStreaks(history);
    const torchLine = result.find((s) => s.text.includes("torch"));
    expect(torchLine?.text).toMatch(
      /torch downloads declined for the 3rd consecutive snapshot\./,
    );
  });

  it("detects monotonic growth", () => {
    const history = [
      mkSnap("2026-05-03", { packages: mkPackages(300) }),
      mkSnap("2026-05-02", { packages: mkPackages(200) }),
      mkSnap("2026-05-01", { packages: mkPackages(100) }),
    ];
    const result = detectSdkStreaks(history);
    const torchLine = result.find((s) => s.text.includes("torch"));
    expect(torchLine?.text).toMatch(
      /torch downloads grew for the 3rd consecutive snapshot\./,
    );
  });

  it("returns no entry when streak is broken (equal value, non-strict)", () => {
    const history = [
      mkSnap("2026-05-03", { packages: mkPackages(100) }),
      mkSnap("2026-05-02", { packages: mkPackages(100) }), // flat
      mkSnap("2026-05-01", { packages: mkPackages(300) }),
    ];
    const result = detectSdkStreaks(history);
    expect(result.find((s) => s.text.includes("torch"))).toBeUndefined();
  });

  it("returns no entry when history has insufficient length", () => {
    const history = [
      mkSnap("2026-05-03", { packages: mkPackages(100) }),
      mkSnap("2026-05-02", { packages: mkPackages(200) }),
    ];
    const result = detectSdkStreaks(history);
    expect(result).toEqual([]);
  });
});

describe("detectOpenWeightTopFiveMovement", () => {
  it("emits a line when open-weight count changes day-over-day", () => {
    const today = "2026-05-03";
    const yesterday = "2026-05-02";
    const orSnaps: Record<string, ModelUsageSnapshotRow> = {
      [today]: mkOrSnap(today, [
        "qwen/qwen-3-coder",
        "moonshotai/kimi-k2",
        "deepseek/deepseek-r1",
        "anthropic/claude-sonnet-4",
        "openai/gpt-6",
      ]),
      [yesterday]: mkOrSnap(yesterday, [
        "qwen/qwen-3-coder",
        "moonshotai/kimi-k2",
        "anthropic/claude-sonnet-4",
        "openai/gpt-6",
        "google/gemini-3",
      ]),
    };
    const history = [mkSnap(today), mkSnap(yesterday)];
    const result = detectOpenWeightTopFiveMovement(history, orSnaps);
    expect(result).toMatch(
      /Open-weight models hold 3 of the OpenRouter top 5 \(vs 2 yesterday\)\./,
    );
  });

  it("returns null when count is unchanged", () => {
    const today = "2026-05-03";
    const yesterday = "2026-05-02";
    const orSnaps: Record<string, ModelUsageSnapshotRow> = {
      [today]: mkOrSnap(today, [
        "qwen/qwen-3-coder",
        "anthropic/claude-sonnet-4",
        "openai/gpt-6",
        "google/gemini-3",
        "x-ai/grok-4",
      ]),
      [yesterday]: mkOrSnap(yesterday, [
        "qwen/qwen-3-coder",
        "anthropic/claude-sonnet-4",
        "openai/gpt-6",
        "google/gemini-3",
        "x-ai/grok-4",
      ]),
    };
    const history = [mkSnap(today), mkSnap(yesterday)];
    expect(detectOpenWeightTopFiveMovement(history, orSnaps)).toBeNull();
  });

  it("returns null when openrouterSnapshots is undefined", () => {
    const history = [mkSnap("2026-05-03"), mkSnap("2026-05-02")];
    expect(detectOpenWeightTopFiveMovement(history, undefined)).toBeNull();
  });
});

describe("detectOpenRouterFirstTimeOpenWeight", () => {
  it("emits when today's count is novel within the lookback window AND ≥3", () => {
    const today = "2026-05-03";
    const orSnaps: Record<string, ModelUsageSnapshotRow> = {
      [today]: mkOrSnap(today, [
        "qwen/qwen-3-coder",
        "moonshotai/kimi-k2",
        "deepseek/deepseek-r1",
        "anthropic/claude-sonnet-4",
        "openai/gpt-6",
      ]),
      "2026-05-02": mkOrSnap("2026-05-02", [
        "qwen/qwen-3-coder",
        "moonshotai/kimi-k2",
        "anthropic/claude-sonnet-4",
        "openai/gpt-6",
        "google/gemini-3",
      ]),
      "2026-05-01": mkOrSnap("2026-05-01", [
        "qwen/qwen-3-coder",
        "anthropic/claude-sonnet-4",
        "openai/gpt-6",
        "google/gemini-3",
        "x-ai/grok-4",
      ]),
    };
    const history = [
      mkSnap(today),
      mkSnap("2026-05-02"),
      mkSnap("2026-05-01"),
    ];
    const result = detectOpenRouterFirstTimeOpenWeight(history, orSnaps);
    expect(result).toMatch(
      /First time in 2 days that 3 open-weight models are in the OpenRouter top 5\./,
    );
  });

  it("returns null when an earlier day already had the same count", () => {
    const today = "2026-05-03";
    const orSnaps: Record<string, ModelUsageSnapshotRow> = {
      [today]: mkOrSnap(today, [
        "qwen/qwen-3-coder",
        "moonshotai/kimi-k2",
        "deepseek/deepseek-r1",
        "anthropic/claude-sonnet-4",
        "openai/gpt-6",
      ]),
      "2026-05-02": mkOrSnap("2026-05-02", [
        "qwen/qwen-3-coder",
        "moonshotai/kimi-k2",
        "deepseek/deepseek-r1",
        "anthropic/claude-sonnet-4",
        "openai/gpt-6",
      ]), // already 3 yesterday
    };
    const history = [mkSnap(today), mkSnap("2026-05-02")];
    expect(
      detectOpenRouterFirstTimeOpenWeight(history, orSnaps),
    ).toBeNull();
  });

  it("returns null when today's count is below the floor (<3)", () => {
    const today = "2026-05-03";
    const orSnaps: Record<string, ModelUsageSnapshotRow> = {
      [today]: mkOrSnap(today, [
        "anthropic/claude-sonnet-4",
        "openai/gpt-6",
        "google/gemini-3",
        "x-ai/grok-4",
        "qwen/qwen-3-coder",
      ]),
    };
    const history = [mkSnap(today)];
    expect(
      detectOpenRouterFirstTimeOpenWeight(history, orSnaps),
    ).toBeNull();
  });
});

describe("detectToolHealthCleanStreak", () => {
  it("emits when 7 consecutive snapshots show zero incidents AND incidentCount24h === 0", () => {
    const seven = Array.from({ length: 7 }, (_, i) =>
      mkSnap(`2026-05-${String(10 - i).padStart(2, "0")}`),
    );
    const result = detectToolHealthCleanStreak(seven, 0);
    expect(result).toMatch(/All AI coding tools operational across the past 7 days\./);
  });

  it("returns null when any tool was non-operational on any day in the window", () => {
    const seven = Array.from({ length: 7 }, (_, i) =>
      mkSnap(`2026-05-${String(10 - i).padStart(2, "0")}`),
    );
    seven[3] = mkSnap("2026-05-07", {
      tools: [
        { id: "anthropic", status: "degraded", activeIncidents: 1 },
        { id: "openai", status: "operational", activeIncidents: 0 },
        { id: "github", status: "operational", activeIncidents: 0 },
      ],
    });
    expect(detectToolHealthCleanStreak(seven, 0)).toBeNull();
  });

  it("returns null when incidentCount24h is non-zero (snapshot may be stale)", () => {
    const seven = Array.from({ length: 7 }, (_, i) =>
      mkSnap(`2026-05-${String(10 - i).padStart(2, "0")}`),
    );
    expect(detectToolHealthCleanStreak(seven, 1)).toBeNull();
  });

  it("returns null when history is shorter than 7 days", () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      mkSnap(`2026-05-${String(10 - i).padStart(2, "0")}`),
    );
    expect(detectToolHealthCleanStreak(six, 0)).toBeNull();
  });
});

describe("trust-contract guardrails", () => {
  it("never emits editorial / causal language ('may', 'consolidating', 'because')", () => {
    // Build a history that fires many rules at once.
    const today = "2026-05-03";
    const history: DailySnapshot[] = [
      mkSnap(today, {
        packages: mkPackages(100),
        benchmarks: {
          publishDate: today,
          top3: [
            { rank: 1, modelName: "GPT-7", organization: "OpenAI", rating: 1510 },
            { rank: 2, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
            { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
          ],
        },
      }),
      mkSnap("2026-05-02", { packages: mkPackages(200) }),
      mkSnap("2026-05-01", { packages: mkPackages(300) }),
    ];
    const lines = deriveInferences({ history, incidentCount24h: 0 });
    const banned = /\b(may|might|likely|because|consolidating|signals?\s|driven\s)\b/i;
    for (const line of lines) {
      expect(line).not.toMatch(banned);
    }
  });
});
