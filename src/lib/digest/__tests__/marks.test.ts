import { describe, expect, it } from "vitest";

import { faviconFallback, markFor, tileIcon } from "@/lib/digest/marks";

describe("markFor", () => {
  it("maps known sources to self-hosted marks", () => {
    expect(markFor("Anthropic status page")).toBe("/marks/anthropic.svg");
    expect(markFor("PyPI")).toBe("/marks/python.svg");
    expect(markFor("pypistats.org")).toBe("/marks/python.svg");
    expect(markFor(undefined, "openai/gpt-5 climbed +4")).toBe("/marks/openai.svg");
    expect(markFor("Hugging Face")).toBe("/marks/huggingface.svg");
    expect(markFor("Ollama")).toBe("/marks/ollama.svg");
  });

  it("returns null for sources without a mark", () => {
    expect(markFor("Docker Hub")).toBeNull();
    expect(markFor("Homebrew")).toBeNull();
    expect(markFor("news.ycombinator.com")).toBeNull();
  });
});

describe("tileIcon", () => {
  it("prefers the self-hosted mark", () => {
    expect(
      tileIcon({ sourceLabel: "Anthropic status page", sourceUrl: "https://status.anthropic.com/" }),
    ).toEqual({ src: "/marks/anthropic.svg", selfHosted: true });
  });

  it("resolves through the URL too: a Docker Hub OLLAMA image gets the ollama mark", () => {
    expect(
      tileIcon({ sourceLabel: "Docker Hub", sourceUrl: "https://hub.docker.com/r/ollama/ollama" }),
    ).toEqual({ src: "/marks/ollama.svg", selfHosted: true });
  });

  it("falls back to the source favicon when no mark exists", () => {
    const icon = tileIcon({
      sourceLabel: "crates.io",
      sourceUrl: "https://crates.io/crates/ort",
    });
    expect(icon?.selfHosted).toBe(false);
    expect(icon?.src).toContain("crates.io");
  });

  it("returns null with neither mark nor parsable URL", () => {
    expect(tileIcon({ sourceLabel: "Somewhere" })).toBeNull();
    expect(faviconFallback("not a url")).toBeNull();
  });
});

describe("marks — never blank (neutral fallback)", () => {
  it("markOrFallback returns the generic mark for unknown sources", async () => {
    const { markOrFallback, FALLBACK_MARK } = await import("@/lib/digest/marks");
    expect(markOrFallback("Windsurf")).toBe(FALLBACK_MARK);
    expect(markOrFallback("DeepSeek")).toBe(FALLBACK_MARK);
    expect(markOrFallback("Anthropic")).toBe("/marks/anthropic.svg");
  });
  it("codex → openai mark, copilot → github mark (platform mapping)", async () => {
    const { markFor } = await import("@/lib/digest/marks");
    expect(markFor("codex")).toBe("/marks/openai.svg");
    expect(markFor("copilot")).toBe("/marks/github.svg");
  });
  it("markPngFor never returns null — always a mark or the generic png", async () => {
    const { markPngFor } = await import("@/lib/digest/marks");
    expect(markPngFor("totally unknown tool")).toBe("/marks/png/generic.png");
    expect(markPngFor("openai")).toBe("/marks/png/openai.png");
  });
});
