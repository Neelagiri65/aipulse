import { describe, expect, it } from "vitest";
import { toSummary } from "@/lib/feed/summary";

describe("toSummary — the source's own words, cleaned and cut at a sentence", () => {
  it("strips markup, decodes entities and drops the WordPress footer (MarkTechPost / Analytics Vidhya shape)", () => {
    const raw = `<![CDATA[<p>Fastino Labs has released GLiNER2.5-Decide, a 340M-parameter model. It&#8217;s open-weight.</p>
<p>The post <a href="https://www.marktechpost.com/x">Fastino Releases GLiNER</a> appeared first on <a href="https://www.marktechpost.com">MarkTechPost</a>.</p>
]]>`;
    expect(toSummary(raw)).toBe("Fastino Labs has released GLiNER2.5-Decide, a 340M-parameter model. It’s open-weight.");
  });

  it("drops a fragment the source itself cut off with an ellipsis (MIT Technology Review shape)", () => {
    const raw = "AI is being optimized for cheating. Models hacked into other systems four times. And that’s&#8230;";
    expect(toSummary(raw)).toBe("AI is being optimized for cheating. Models hacked into other systems four times.");
  });

  it("never splits a sentence at a decimal point or a version number", () => {
    expect(toSummary("GLiNER2.5 runs on v1.13 hardware. It is fast.", "", 40)).toBe("GLiNER2.5 runs on v1.13 hardware.");
  });

  it("treats WordPress's excerpt marker […] as the source's own cut (Analytics Vidhya, live 2026-09-25)", () => {
    expect(toSummary("It is trending on X. TypeSafe AI came out of two years in stealth on […]"))
      .toBe("It is trending on X.");
    expect(toSummary("It is trending on X. And then [...]")).toBe("It is trending on X.");
  });

  it("keeps whole sentences up to the cap", () => {
    const s = "One short sentence. " + "A second sentence that is long enough to matter here. ".repeat(3);
    const out = toSummary(s, "", 80)!;
    expect(out).toBe("One short sentence. A second sentence that is long enough to matter here.");
    expect(out.length).toBeLessThanOrEqual(80);
  });

  it("cuts a single over-long sentence at a word and marks the cut", () => {
    const out = toSummary("word ".repeat(100).trim(), "", 50)!;
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out).not.toMatch(/\s…$/);
  });

  it("keeps a text with no final stop (The Register's standfirst, Heise's German teaser)", () => {
    expect(toSummary("<![CDATA[ It’s a better interface, can speed installations ]]>"))
      .toBe("It’s a better interface, can speed installations");
    expect(toSummary("Forscher haben eine drahtlose Technik entwickelt, die Daten austauscht."))
      .toBe("Forscher haben eine drahtlose Technik entwickelt, die Daten austauscht.");
  });

  it("is absent when empty, markup-only, or just the headline again", () => {
    expect(toSummary(undefined)).toBeUndefined();
    expect(toSummary("   <p></p> ")).toBeUndefined();
    expect(toSummary("Claude Opus 5.5: how good is it?", "Claude Opus 5.5 — How Good Is It")).toBeUndefined();
  });

  it("never invents words: every word out is a word in", () => {
    const raw = "<p>Alpha beta &amp; gamma. Delta epsilon!</p>";
    const words = (t: string) => t.split(/\s+/).map((w) => w.replace(/[^\p{L}&]/gu, "")).filter(Boolean);
    const inWords = new Set(words("Alpha beta & gamma. Delta epsilon!"));
    for (const w of words(toSummary(raw)!)) expect(inWords.has(w)).toBe(true);
  });
});
