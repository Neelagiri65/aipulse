import { describe, expect, it } from "vitest";

import {
  communitySourceLabel,
  deltaPctFromHeadline,
  distilHeadline,
  duplicatesLeaderboard,
  isRankStory,
  mentionedModelName,
  normalisePackageName,
  storyGate,
  toolStatusFromEvent,
  trimNarration,
} from "../content-gates";

/**
 * These tests pin the founder's video content-quality rules to the
 * incidents that created them. The rules were enforced only inside
 * scripts/video/generate-daily-script.ts (outside vitest's include
 * pattern) — encoded but silently regressable, one step from the
 * lead-freshness class (a rule that existed only in prose for 53 days).
 */

describe("storyGate — verifiable-metric rule", () => {
  // The incident: stories 5–10 were unfiltered Reddit headlines with no
  // data. Founder: "pathetic".
  it("rejects the exact incident headlines (no metrics at all)", () => {
    expect(storyGate("Vibed up an old shockwave game I used to play in high school", {}, "reddit"))
      .toEqual({ ok: false, reason: "no-metric" });
    expect(storyGate("B9109: preemptive fix for mtp", undefined, "reddit"))
      .toEqual({ ok: false, reason: "no-metric" });
  });

  it("accepts a story backed by each kind of hard metric", () => {
    expect(storyGate("Kimi K2 climbs", { rank: 3 }, "openrouter").ok).toBe(true);
    expect(storyGate("langchain downloads surge", { deltaPct: 42 }, "npm").ok).toBe(true);
    expect(storyGate("immich-app/immich trending", { stars: 475 }, "github").ok).toBe(true);
  });

  it("accepts high engagement (100+ points or 50+ comments)", () => {
    expect(storyGate("Big model comparison thread", { points: 150 }, "reddit").ok).toBe(true);
    expect(storyGate("Big model comparison thread", { comments: 60 }, "hn").ok).toBe(true);
    expect(storyGate("Quiet thread", { points: 99, comments: 49 }, "reddit").ok).toBe(false);
  });

  it("accepts a parseable rank change in the headline (wire events without metrics)", () => {
    expect(storyGate("Claude Opus down 3 ranks on OpenRouter", {}, "wire").ok).toBe(true);
  });

  it("accepts research provenance (arXiv)", () => {
    expect(storyGate("Sparse attention at scale", {}, "arxiv").ok).toBe(true);
  });

  it("rejects personal anecdotes even with high engagement, unless a hard metric backs them", () => {
    expect(storyGate("I built a RAG pipeline over the weekend", { points: 220 }, "reddit"))
      .toEqual({ ok: false, reason: "personal-project" });
    expect(storyGate("Tell HN: my startup failed", { points: 300 }, "hn"))
      .toEqual({ ok: false, reason: "personal-complaint" });
    // A hard metric overrides the personal-framing filter
    expect(storyGate("I built a RAG pipeline over the weekend", { stars: 900 }, "github").ok).toBe(true);
  });
});

describe("duplicatesLeaderboard — top-5 exclusion", () => {
  // The incident: Kimi appeared in the leaderboard AND as a standalone
  // rank-change card. ALL top-5 rows are excluded, not just #1.
  const top5 = new Set(["deepseek v3.2", "kimi k2", "claude opus 4.8", "gpt-5.2", "gemini 3 pro"]);

  it("catches any top-5 model, not just #1", () => {
    expect(duplicatesLeaderboard("Kimi K2 up 3 ranks this week", top5)).toBe(true);
    expect(duplicatesLeaderboard("Gemini 3 Pro price drop", top5)).toBe(true);
  });

  it("passes models outside the top-5 and is inert on an empty leaderboard", () => {
    expect(duplicatesLeaderboard("Qwen 3.5 up 4 ranks", top5)).toBe(false);
    expect(duplicatesLeaderboard("Kimi K2 up 3 ranks", new Set<string>())).toBe(false);
  });
});

describe("normalisePackageName — SDK dedup", () => {
  // The incident: HuggingFace downloads appeared as both a curated
  // narrative and an SDK supplement (same data, different wording).
  it("makes the curated-narrative and supplement spellings collide", () => {
    // curated path normalises the headline's first word; supplement path
    // normalises the registry package name — both must land on one key
    expect(normalisePackageName("huggingface-hub")).toBe(normalisePackageName("HuggingFace-Hub"));
    expect(normalisePackageName("huggingface_hub".replace(/_/g, "-"))).toBe("huggingfacehub");
  });
});

describe("trimNarration — never chop mid-thought", () => {
  // The incident: "Vibed up an old shockwave game I used to play in
  // high." — a word-count chop mid-clause. Worse than no narration.
  it("returns short narrations verbatim", () => {
    expect(trimNarration("DeepSeek holds number one.", 5)).toBe("DeepSeek holds number one.");
  });

  it("keeps whole sentences that fit the window instead of chopping words", () => {
    const text =
      "DeepSeek holds number one on OpenRouter. Pricing stays at twenty-eight cents per million tokens. Kimi K2 sits in second place and Claude rounds out the top three overall.";
    const out = trimNarration(text, 10); // 25-word budget
    expect(out).toBe(
      "DeepSeek holds number one on OpenRouter. Pricing stays at twenty-eight cents per million tokens.",
    );
  });

  it("respects the speech-pace budget: 5s → 12 words, 10s → 25 words", () => {
    const long = Array(40).fill("word").join(" ") + ".";
    expect(trimNarration(long, 5).split(/\s+/).length).toBeLessThanOrEqual(12);
    expect(trimNarration(long, 10).split(/\s+/).length).toBeLessThanOrEqual(25);
  });

  it("always ends at a boundary with terminal punctuation, never a dangling conjunction", () => {
    const awkward =
      "The new agent framework shipped with support for tools and memory and the maintainers say more is coming soon";
    const out = trimNarration(awkward, 5);
    expect(out).toMatch(/[.!?]$/);
    expect(out).not.toMatch(/\s(and|but|or|the|a|an|in|on|at|for|of|with|from|to|is|was|that|this)\.$/i);
  });
});

describe("distilHeadline — strip personal framing", () => {
  it("rewrites 'I built…' as a neutral broadcast label", () => {
    expect(distilHeadline("I built a terminal for coding agents")).toBe(
      "New tool: a terminal for coding agents.",
    );
  });

  it("strips the incident's personal relative clause", () => {
    expect(distilHeadline("Vibed up an old shockwave game I used to play in high school")).toBe(
      "Vibed up an old shockwave game.",
    );
  });

  it("reframes 'Is Anyone…' questions and strips trailing commentary", () => {
    expect(distilHeadline("Is Anyone still using LangChain in production")).toBe(
      "Community asks: still using LangChain in production.",
    );
    expect(distilHeadline("Benchmarked 12 models on long context, here's what I found")).toBe(
      "Benchmarked 12 models on long context.",
    );
  });
});

describe("deltaPctFromHeadline — headline-asserted deltas (follow-up)", () => {
  // The incident: "@anthropic-ai/sdk on npm +25% vs baseline" — the day's
  // most on-thesis story — skipped because the wire event carried the
  // figure only in its headline, never in metrics.deltaPct.
  it("parses signed and worded delta claims", () => {
    expect(deltaPctFromHeadline("@anthropic-ai/sdk on npm +25% vs baseline")).toBe(25);
    expect(deltaPctFromHeadline("cody installs down 41.5% this month")).toBe(-41.5);
    expect(deltaPctFromHeadline("tokens served -12% week on week")).toBe(-12);
    expect(deltaPctFromHeadline("usage up 30%")).toBe(30);
  });

  it("does NOT treat a bare proportion as a movement", () => {
    expect(deltaPctFromHeadline("90% of developers now use AI tools")).toBeNull();
    expect(deltaPctFromHeadline("Model scores 85% on the new benchmark")).toBeNull();
    expect(deltaPctFromHeadline("No percentages here at all")).toBeNull();
  });

  it("storyGate accepts the incident headline from a wire source only", () => {
    expect(storyGate("@anthropic-ai/sdk on npm +25% vs baseline", {}, "gawk-wire").ok).toBe(true);
    // a community post asserting a delta is an anecdote, not a registry figure
    expect(storyGate("My inference costs down 90% after switching", {}, "reddit").ok).toBe(false);
    expect(storyGate("Throughput up 40% with the new runtime", {}, "hn").ok).toBe(false);
  });
});

describe("isRankStory + mentionedModelName — cross-source model dedup (follow-up)", () => {
  // The incident: Claude Sonnet 5 shipped TWICE in one video — "up 5
  // ranks" (gawk-wire) and "moved from rank 24 to 19" (gawk-models) are
  // the same fact from two sources. Top-5 exclusion didn't apply (#19).
  const modelNames = ["DeepSeek V4 Flash", "Claude Sonnet 5", "Kimi K2"];

  it("recognises both incident headlines as rank stories", () => {
    expect(isRankStory("Anthropic: Claude Sonnet 5 up 5 ranks on OpenRouter weekly", {})).toBe(true);
    expect(isRankStory("Claude Sonnet 5 moved from rank 24 to 19", { rank: 19, previousRank: 24 })).toBe(true);
    expect(isRankStory("sqlite-utils 4.0rc2 released", { comments: 56 })).toBe(false);
  });

  it("resolves the same model from both headlines so the second dedups", () => {
    const a = mentionedModelName("Anthropic: Claude Sonnet 5 up 5 ranks on OpenRouter weekly", modelNames);
    const b = mentionedModelName("Claude Sonnet 5 moved from rank 24 to 19", modelNames);
    expect(a).toBe("claude sonnet 5");
    expect(b).toBe(a);
    expect(mentionedModelName("immich-app/immich trending on GitHub", modelNames)).toBeNull();
  });
});

describe("communitySourceLabel — honest card sourcing (follow-up)", () => {
  // The incident: the high-engagement branch hardcoded "Reddit", so an
  // HN thread shipped on air with "Source: Reddit" on the card.
  it("labels the actual community source, never a hardcoded one", () => {
    expect(communitySourceLabel("hn")).toBe("Hacker News");
    expect(communitySourceLabel("reddit")).toBe("Reddit");
    expect(communitySourceLabel("lobsters")).toBe("Community");
    expect(communitySourceLabel(undefined)).toBe("Community");
  });
});

describe("toolStatusFromEvent + storyGate — tool health qualifies (founder decision 2026-07-06)", () => {
  // The incident: "Openai Api is degraded" — a vendor-declared status,
  // verifiable via gawk's own /api/v1/status — was skipped every day as
  // "no verifiable metric". Tool health is gawk's differentiator and the
  // bucket was structurally locked out of the video.
  const tags = ["tools", "outage", "degraded"];

  it("parses the declared status from the ingest's title shape", () => {
    expect(toolStatusFromEvent("Openai Api is degraded", tags)).toEqual({ status: "degraded", direction: "down" });
    expect(toolStatusFromEvent("Codex is major_outage", ["tools", "outage", "major_outage"]))
      .toEqual({ status: "major_outage", direction: "down" });
    expect(toolStatusFromEvent("Claude Code is operational", ["tools", "operational"]))
      .toEqual({ status: "operational", direction: "up" });
  });

  it("returns null when no declared status is present", () => {
    expect(toolStatusFromEvent("Tooling roundup for June", ["tools"])).toBeNull();
  });

  it("qualifies ONLY events from the tools ingest — community 'X is degraded' is hearsay", () => {
    expect(storyGate("Openai Api is degraded", {}, "gawk-tools", tags).ok).toBe(true);
    expect(storyGate("OpenAI API is degraded again", {}, "hn", ["discussion"]).ok).toBe(false);
    expect(storyGate("OpenAI API is degraded again", {}, "reddit", []).ok).toBe(false);
  });
});
