import { describe, expect, it } from "vitest";

import {
  OPEN_WEIGHT_PATTERNS,
  isOpenWeight,
} from "@/lib/data/open-weight";

describe("isOpenWeight", () => {
  it("recognises Kimi (Sabari's example — #1 on OpenRouter, open-weight)", () => {
    expect(isOpenWeight("moonshotai/kimi-k2.6")).toBe(true);
  });

  it("recognises Qwen, DeepSeek, Llama, Gemma, Mistral families", () => {
    expect(isOpenWeight("qwen/qwen-3-72b")).toBe(true);
    expect(isOpenWeight("deepseek/deepseek-v4")).toBe(true);
    expect(isOpenWeight("meta-llama/llama-4-maverick")).toBe(true);
    expect(isOpenWeight("google/gemma-3-27b")).toBe(true);
    expect(isOpenWeight("mistralai/mistral-large-3")).toBe(true);
    expect(isOpenWeight("mistralai/mixtral-8x22b")).toBe(true);
    expect(isOpenWeight("microsoft/phi-4")).toBe(true);
    expect(isOpenWeight("01-ai/yi-1.5-34b")).toBe(true);
  });

  it("does NOT tag Google's proprietary Gemini as open", () => {
    expect(isOpenWeight("google/gemini-2.5-pro")).toBe(false);
    expect(isOpenWeight("google/gemini-flash")).toBe(false);
  });

  it("does NOT tag Anthropic / OpenAI proprietary models as open", () => {
    expect(isOpenWeight("anthropic/claude-sonnet-4.6")).toBe(false);
    expect(isOpenWeight("anthropic/claude-opus-4.7")).toBe(false);
    expect(isOpenWeight("openai/gpt-5")).toBe(false);
    expect(isOpenWeight("openai/o3-mini")).toBe(false);
  });

  it("recognises grok-1 (open) but not grok-2 / grok-3 (proprietary)", () => {
    expect(isOpenWeight("xai/grok-1")).toBe(true);
    expect(isOpenWeight("xai/grok-2")).toBe(false);
    expect(isOpenWeight("xai/grok-3-beta")).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(isOpenWeight("META-LLAMA/Llama-4-Scout")).toBe(true);
    expect(isOpenWeight("Qwen/Qwen3-VL-2B-Instruct")).toBe(true);
  });

  it("works on bare model names without a publisher prefix", () => {
    expect(isOpenWeight("gemma-3-27b")).toBe(true);
    expect(isOpenWeight("gemini-2.5-pro")).toBe(false);
  });

  it("returns false for empty / nullish input", () => {
    expect(isOpenWeight(undefined)).toBe(false);
    expect(isOpenWeight(null)).toBe(false);
    expect(isOpenWeight("")).toBe(false);
    expect(isOpenWeight("publisher/")).toBe(false);
  });

  it("exposes OPEN_WEIGHT_PATTERNS as a non-empty readonly list", () => {
    expect(OPEN_WEIGHT_PATTERNS.length).toBeGreaterThan(0);
    for (const p of OPEN_WEIGHT_PATTERNS) {
      expect(typeof p).toBe("string");
      expect(p).toBe(p.toLowerCase());
    }
  });
});
