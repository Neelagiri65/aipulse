import { describe, expect, it, vi } from "vitest";
import { fetchModelCardParagraph, firstProseParagraph } from "@/lib/data/hf-model-card";

describe("firstProseParagraph — the publisher's first paragraph, markdown reduced to text", () => {
  it("skips front-matter, headings, badges and HTML, and keeps the first prose paragraph", () => {
    const md = [
      "---", "license: mit", "library_name: transformers", "---",
      "# DeepSeek-V3.2",
      '<div align="center"><img src="logo.svg"/></div>',
      "[![Chat](https://img.shields.io/badge/chat-blue)](https://chat.deepseek.com)",
      "## Introduction",
      "We introduce **DeepSeek-V3.2**, a model that harmonizes high computational efficiency with superior reasoning. See the [paper](https://arxiv.org/abs/1).",
      "Second paragraph.",
    ].join("\n\n");
    expect(firstProseParagraph(md)).toBe(
      "We introduce DeepSeek-V3.2, a model that harmonizes high computational efficiency with superior reasoning. See the paper.");
  });

  it("keeps a paragraph that opens in bold, skips list items, tables and code with blank lines inside", () => {
    const md = [
      "```python\nimport torch\n\nmodel = load()\n```",
      "- item one\n- item two",
      "| a | b |\n|---|---|",
      "**Artemis-31B** is a static GGUF quantization of `TheDrummer/Artemis-31B`.",
    ].join("\n\n");
    expect(firstProseParagraph(md)).toBe("Artemis-31B is a static GGUF quantization of TheDrummer/Artemis-31B.");
  });

  it("a card with no prose has no paragraph", () => {
    expect(firstProseParagraph("---\nlicense: apache-2.0\n---\n\n# Model\n\n![img](a.png)")).toBeUndefined();
    expect(firstProseParagraph("")).toBeUndefined();
  });
});

describe("fetchModelCardParagraph", () => {
  it("reads the model's raw README and never throws", async () => {
    const ok = vi.fn().mockResolvedValue(new Response("# X\n\nA compact model for code completion tasks.", { status: 200 }));
    expect(await fetchModelCardParagraph("org/x", ok as unknown as typeof fetch)).toBe("A compact model for code completion tasks.");
    expect(ok.mock.calls[0][0]).toBe("https://huggingface.co/org/x/raw/main/README.md");
    const missing = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    expect(await fetchModelCardParagraph("org/y", missing as unknown as typeof fetch)).toBeUndefined();
    const down = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    expect(await fetchModelCardParagraph("org/z", down as unknown as typeof fetch)).toBeUndefined();
  });
});
