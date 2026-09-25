import { describe, expect, it, vi } from "vitest";
import {
  ARTICLE_MIN_CHARS,
  MACHINE_SUMMARY_MODEL,
  articleText,
  isGrounded,
  summariseArticle,
} from "@/lib/summaries/machine-summary";

const ARTICLE =
  "<html><head><script>track()</script></head><body><nav><p>Home · Sections · Subscribe to our newsletter today</p></nav>" +
  "<p>Mistral released Devstral 3, a 24B coding model, under the Apache 2.0 licence on Tuesday.</p>" +
  "<p>The company says the model scores 61.2% on SWE-bench Verified and runs on a single RTX 4090 card.</p>" +
  "<p>" + "Developers can download the weights from Hugging Face and run them locally with vLLM. ".repeat(6) + "</p>" +
  "<footer><p>Copyright 2026 Example Media. All rights reserved worldwide.</p></footer></body></html>";

describe("articleText", () => {
  it("keeps the article's paragraphs and drops scripts, navigation and footers", () => {
    const text = articleText(ARTICLE);
    expect(text).toContain("Mistral released Devstral 3");
    expect(text).toContain("61.2%");
    expect(text).not.toContain("Subscribe");
    expect(text).not.toContain("Copyright");
    expect(text).not.toContain("track()");
  });
});

describe("isGrounded — rejects what a reader cannot check", () => {
  const source = articleText(ARTICLE);
  it("accepts a summary whose numbers and names are all in the text", () => {
    expect(isGrounded("Mistral released Devstral 3, a 24B coding model under Apache 2.0. It scores 61.2% on SWE-bench Verified.", source)).toBe(true);
  });
  it("rejects an invented number", () => {
    expect(isGrounded("Mistral released Devstral 3, which scores 72.5% on SWE-bench Verified.", source)).toBe(false);
  });
  it("rejects an invented name", () => {
    expect(isGrounded("Mistral released Devstral 3 to compete with Anthropic.", source)).toBe(false);
  });
  it("typography is not content: curly apostrophes, possessives, special hyphens and spaced thousands match", () => {
    const src = "The Pentagon's 2-1 ruling covers 150,000 lines of code written by David Heinemeier Hansson.";
    expect(isGrounded("The Pentagon\u2019s 2\u20111 ruling covers 150\u202F000 lines by David Heinemeier Hansson.", src)).toBe(true);
    expect(isGrounded("The Pentagon ruling covers 250 000 lines of code written by Hansson.", src)).toBe(false);
  });

  it("rejects a fragment: fewer than eight words, or no closing stop", () => {
    expect(isGrounded("Here", source)).toBe(false);
    expect(isGrounded("Mistral released Devstral 3, a 24B coding model", source)).toBe(false);
  });

  it("rejects quotation, more than two sentences, too many words, and empty text", () => {
    expect(isGrounded('Mistral called it "the best" model.', source)).toBe(false);
    expect(isGrounded("Mistral released it today. It is a small model. It runs on one card locally.", source)).toBe(false);
    expect(isGrounded("Mistral " + "released a model ".repeat(25) + ".", source)).toBe(false);
    expect(isGrounded("   ", source)).toBe(false);
  });
});

function fetchWith(page: Response | Error, model: Response | Error) {
  return vi.fn(async (url: string) => {
    const r = url.includes("integrate.api.nvidia.com") ? model : page;
    if (r instanceof Error) throw r;
    return r.clone();
  }) as unknown as typeof fetch;
}
const nim = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

describe("summariseArticle — fails closed at every step", () => {
  const base = { url: "https://example.com/devstral", title: "Mistral releases Devstral 3", apiKey: "k", now: () => new Date("2026-09-26T10:00:00Z") };

  it("returns a traceable summary when the article reads and the answer is grounded", async () => {
    const out = await summariseArticle({ ...base, fetchImpl: fetchWith(new Response(ARTICLE), nim("Mistral released Devstral 3, a 24B coding model under Apache 2.0.")) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.summary).toMatchObject({
      text: "Mistral released Devstral 3, a 24B coding model under Apache 2.0.",
      model: MACHINE_SUMMARY_MODEL, promptVersion: "ms-1", inputUrl: base.url, generatedAt: "2026-09-26T10:00:00.000Z",
    });
    expect(out.summary.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("an ungrounded answer is dropped, not shown", async () => {
    const out = await summariseArticle({ ...base, fetchImpl: fetchWith(new Response(ARTICLE), nim("Mistral released Devstral 3 with 99% accuracy.")) });
    expect(out).toMatchObject({ ok: false, reason: "ungrounded" });
  });

  it("a page too short to be an article, a failed fetch, a failed model call: no summary", async () => {
    expect(await summariseArticle({ ...base, fetchImpl: fetchWith(new Response("<p>" + "x".repeat(ARTICLE_MIN_CHARS / 4) + "</p>"), nim("x")) }))
      .toMatchObject({ ok: false, reason: "too-short" });
    expect(await summariseArticle({ ...base, fetchImpl: fetchWith(new Response("", { status: 403 }), nim("x")) }))
      .toMatchObject({ ok: false, reason: "fetch" });
    expect(await summariseArticle({ ...base, fetchImpl: fetchWith(new Error("timeout"), nim("x")) }))
      .toMatchObject({ ok: false, reason: "fetch" });
    expect(await summariseArticle({ ...base, fetchImpl: fetchWith(new Response(ARTICLE), new Response("busy", { status: 429 })) }))
      .toMatchObject({ ok: false, reason: "model" });
  });

  it("a reasoning model's <think> block is not part of the summary", async () => {
    const out = await summariseArticle({ ...base, fetchImpl: fetchWith(new Response(ARTICLE), nim("<think>Let me read. 99 things.</think> Mistral released Devstral 3, a 24B coding model.")) });
    expect(out.ok && out.summary.text).toBe("Mistral released Devstral 3, a 24B coding model.");
  });

  it("a model failure says why, for the operator (status and body excerpt)", async () => {
    const out = await summariseArticle({ ...base, fetchImpl: fetchWith(new Response(ARTICLE), new Response('{"detail":"Function not found"}', { status: 404 })) });
    expect(out).toMatchObject({ ok: false, reason: "model", detail: 'HTTP 404 {"detail":"Function not found"}' });
  });
});
