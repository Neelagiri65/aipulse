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
