import { describe, expect, it } from "vitest";

import type { HuggingFaceModel } from "@/lib/data/fetch-models";
import {
  deriveNewReleaseCards,
  isKnownLab,
} from "@/lib/feed/derivers/new-release";

const NOW = Date.parse("2026-04-29T12:00:00.000Z");

function model(partial: Partial<HuggingFaceModel> & { id: string }): HuggingFaceModel {
  const slash = partial.id.indexOf("/");
  const author =
    partial.author ?? (slash > 0 ? partial.id.slice(0, slash) : partial.id);
  const name = slash > 0 ? partial.id.slice(slash + 1) : partial.id;
  return {
    id: partial.id,
    author,
    name,
    downloads: partial.downloads ?? 0,
    likes: partial.likes ?? 50,
    lastModified: partial.lastModified ?? "2026-04-29T11:00:00.000Z",
    createdAt: partial.createdAt ?? "2026-04-28T18:00:00.000Z",
    license: partial.license,
    pipelineTag: partial.pipelineTag ?? "text-generation",
    hubUrl: partial.hubUrl ?? `https://huggingface.co/${partial.id}`,
  };
}

describe("isKnownLab", () => {
  it("matches MAJOR_LAB_AUTHORS verbatim", () => {
    expect(isKnownLab("anthropic")).toBe(true);
    expect(isKnownLab("openai")).toBe(true);
    expect(isKnownLab("google")).toBe(true);
    expect(isKnownLab("mistralai")).toBe(true);
    expect(isKnownLab("moonshotai")).toBe(true);
  });

  it("aliases HuggingFace's `deepseek-ai` org to OpenRouter's `deepseek`", () => {
    expect(isKnownLab("deepseek-ai")).toBe(true);
    expect(isKnownLab("deepseek")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isKnownLab("Qwen")).toBe(true);
    expect(isKnownLab("META-LLAMA")).toBe(true);
  });

  it("rejects no-name fine-tune authors", () => {
    expect(isKnownLab("randomuser")).toBe(false);
    expect(isKnownLab("some-fine-tuner")).toBe(false);
    expect(isKnownLab("")).toBe(false);
    expect(isKnownLab(undefined)).toBe(false);
  });
});

describe("deriveNewReleaseCards", () => {
  it("emits a card for a known lab's model published within 48h with enough likes", () => {
    const cards = deriveNewReleaseCards(
      [
        model({
          id: "moonshotai/kimi-k2.6",
          createdAt: "2026-04-28T08:00:00.000Z", // 28h ago
          likes: 240,
          downloads: 18_000,
          license: "modified-mit",
        }),
      ],
      NOW,
    );
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card.type).toBe("NEW_RELEASE");
    expect(card.severity).toBe(70);
    expect(card.headline).toBe("moonshotai released kimi-k2.6");
    expect(card.detail).toContain("OPEN");
    expect(card.detail).toContain("modified-mit");
    expect(card.detail).toContain("28h ago");
    expect(card.sourceUrl).toBe("https://huggingface.co/moonshotai/kimi-k2.6");
    expect(card.meta.openWeight).toBe(true);
    expect(card.meta.license).toBe("modified-mit");
  });

  it("rejects models older than the 48h window", () => {
    const cards = deriveNewReleaseCards(
      [
        model({
          id: "qwen/qwen-3-72b",
          createdAt: "2026-04-26T08:00:00.000Z", // ~76h ago
          likes: 500,
        }),
      ],
      NOW,
    );
    expect(cards).toEqual([]);
  });

  it("rejects models with too few likes (first-paint social proof gate)", () => {
    const cards = deriveNewReleaseCards(
      [
        model({
          id: "google/gemma-4-9b",
          createdAt: "2026-04-29T08:00:00.000Z",
          likes: 2, // < NEW_RELEASE_MIN_LIKES (5)
        }),
      ],
      NOW,
    );
    expect(cards).toEqual([]);
  });

  it("rejects models from no-name fine-tune authors", () => {
    const cards = deriveNewReleaseCards(
      [
        model({
          id: "randomuser/llama-3-finetune",
          createdAt: "2026-04-29T08:00:00.000Z",
          likes: 100,
        }),
      ],
      NOW,
    );
    expect(cards).toEqual([]);
  });

  it("rejects future-dated createdAt rather than leaking negative-age cards", () => {
    const cards = deriveNewReleaseCards(
      [
        model({
          id: "google/gemma-4-9b",
          createdAt: "2027-01-01T00:00:00.000Z",
          likes: 100,
        }),
      ],
      NOW,
    );
    expect(cards).toEqual([]);
  });

  it("rejects models with no createdAt or unparseable createdAt", () => {
    const noCreated = { ...model({ id: "google/gemma-4-9b", likes: 100 }) };
    delete (noCreated as Partial<HuggingFaceModel>).createdAt;
    const bad = model({
      id: "google/gemma-4-mini",
      likes: 100,
      createdAt: "not-an-iso-date",
    });
    const cards = deriveNewReleaseCards([noCreated, bad], NOW);
    expect(cards).toEqual([]);
  });

  it("flags proprietary frontier releases as known-lab but not OPEN", () => {
    const cards = deriveNewReleaseCards(
      [
        model({
          id: "anthropic/claude-opus-4.7",
          createdAt: "2026-04-28T08:00:00.000Z",
          likes: 80,
          license: "proprietary",
        }),
      ],
      NOW,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].meta.openWeight).toBe(false);
    expect(cards[0].detail).not.toContain("OPEN");
    expect(cards[0].detail).toContain("proprietary");
  });

  it("omits license from the detail line when HF returned no license string", () => {
    const m = model({
      id: "google/gemma-4-9b",
      createdAt: "2026-04-29T06:00:00.000Z",
      likes: 100,
    });
    delete (m as Partial<HuggingFaceModel>).license;
    const [card] = deriveNewReleaseCards([m], NOW);
    expect(card.detail).toContain("OPEN");
    expect(card.detail).not.toContain("undefined");
    expect(card.detail).not.toMatch(/·\s*·/); // no double separator
  });
});
