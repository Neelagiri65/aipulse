import { describe, expect, it } from "vitest";
import { renderDigestHtml } from "@/lib/email/templates/digest";
import type { DigestBody } from "@/lib/digest/types";

function mkDigest(overrides: Partial<DigestBody> = {}): DigestBody {
  return {
    date: "2026-04-22",
    subject: "Gawk — 2026-04-22 · 1 tool incident",
    mode: "diff",
    greetingTemplate:
      "Good morning from Gawk — here's what moved in {geoCountry} and beyond in the last 24h.",
    generatedAt: "2026-04-22T08:00:00.000Z",
    sections: [
      {
        id: "tool-health",
        title: "Tool Health",
        anchorSlug: "tool-health",
        mode: "diff",
        headline: "1 incident on Anthropic in the last 24h",
        items: [
          {
            headline: "Anthropic — partial API outage",
            detail: "45min impact on messages endpoint",
            sourceLabel: "status.anthropic.com",
            sourceUrl: "https://status.anthropic.com/",
          },
        ],
        sourceUrls: ["https://status.anthropic.com/"],
      },
      {
        id: "benchmarks",
        title: "Benchmarks",
        anchorSlug: "benchmarks",
        mode: "quiet",
        headline: "No rank changes on LMArena in the last 24h.",
        items: [],
        sourceUrls: ["https://lmarena.ai/"],
      },
    ],
    ...overrides,
  };
}

const BASE = {
  digest: mkDigest(),
  baseUrl: "https://gawk.dev",
  unsubUrl: "https://gawk.dev/api/subscribe/unsubscribe?token=tok-abc",
  countryCode: "GB",
};

describe("renderDigestHtml — greeting", () => {
  it("substitutes the geo country when known", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("United Kingdom");
    expect(html).not.toContain("{geoCountry}");
  });

  it("strips the geo clause when country is null", async () => {
    const html = await renderDigestHtml({ ...BASE, countryCode: null });
    expect(html).not.toContain("{geoCountry}");
    expect(html).not.toContain("United Kingdom");
  });
});

describe("renderDigestHtml — sections", () => {
  it("renders the subject as the H1", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("Gawk — 2026-04-22");
  });

  it("renders each section title and headline", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("Tool Health");
    expect(html).toContain("1 incident on Anthropic in the last 24h");
    expect(html).toContain("Benchmarks");
    expect(html).toContain("No rank changes on LMArena in the last 24h.");
  });

  it("renders item headlines and details", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("Anthropic — partial API outage");
    expect(html).toContain("45min impact on messages endpoint");
  });
});

describe("renderDigestHtml — per-section links", () => {
  it("emits a 'View on Gawk' deep link with the section anchor", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain(
      "https://gawk.dev/digest/2026-04-22#tool-health",
    );
    expect(html).toContain(
      "https://gawk.dev/digest/2026-04-22#benchmarks",
    );
    expect(html).toContain("View on Gawk");
  });

  it("emits LinkedIn and X share links per section", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("linkedin.com/sharing/share-offsite/");
    expect(html).toContain("x.com/intent/tweet");
  });

  it("share URLs include the section anchor in the encoded url param", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toMatch(
      /linkedin\.com\/sharing\/share-offsite\/\?url=https%3A%2F%2Fgawk\.dev%2Fdigest%2F2026-04-22%23tool-health/,
    );
  });
});

describe("renderDigestHtml — sources", () => {
  it("renders section-level source links", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("https://status.anthropic.com/");
    expect(html).toContain("https://lmarena.ai/");
  });

  it("renders per-item source labels when provided", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("status.anthropic.com");
  });
});

describe("renderDigestHtml — TL;DR + chrome", () => {
  it('drops the legacy "GAWK" eyebrow above the H1 — title is enough', async () => {
    const html = await renderDigestHtml(BASE);
    // The eyebrow was a standalone uppercase "GAWK" text node above the
    // H1. Subject and H1 already say "Gawk —" so a third repetition was
    // pure noise.
    expect(html).not.toMatch(/>GAWK</);
  });

  it("renders digest.tldr in place of the greeting when set", async () => {
    const withTldr = mkDigest({
      tldr: "1 tool incident · 5 HN stories · 4 benchmark movers",
    });
    const html = await renderDigestHtml({ ...BASE, digest: withTldr });
    expect(html).toContain("1 tool incident · 5 HN stories · 4 benchmark movers");
    expect(html).not.toContain("Good morning from Gawk");
  });

  it("falls back to the greeting when tldr is undefined (bootstrap/quiet modes)", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("Good morning from Gawk");
  });

  it("renders the View on Gawk CTA in its own paragraph, separated from the share row", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("View on Gawk →");
    expect(html).toContain("Share:");
    // Structural separation: there must be a closing `</p>` between the
    // primary CTA and the share row so they render as two stacked rows
    // rather than the previous inline run-on.
    const viewIdx = html.indexOf("View on Gawk →");
    const shareIdx = html.indexOf("Share:");
    expect(viewIdx).toBeGreaterThanOrEqual(0);
    expect(shareIdx).toBeGreaterThan(viewIdx);
    expect(html.slice(viewIdx, shareIdx)).toContain("</p>");
  });
});

describe("renderDigestHtml — footer", () => {
  it("includes the per-recipient unsubscribe URL", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain(
      "https://gawk.dev/api/subscribe/unsubscribe?token=tok-abc",
    );
    expect(html).toContain("Unsubscribe");
  });

  it("includes the privacy link", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("https://gawk.dev/privacy");
  });
});

describe("renderDigestHtml — inferences (S60 Build 1)", () => {
  it("renders the 'What moved' block with each inference line when populated", async () => {
    const withInferences = mkDigest({
      inferences: [
        "New #1 on LMArena: GPT-7 overtook Claude Opus 4.7.",
        "torch downloads declined for the 3rd consecutive snapshot.",
        "All AI coding tools operational across the past 7 days.",
      ],
    });
    const html = await renderDigestHtml({ ...BASE, digest: withInferences });
    expect(html).toContain("What moved");
    expect(html).toContain("New #1 on LMArena: GPT-7 overtook Claude Opus 4.7.");
    expect(html).toContain("torch downloads declined for the 3rd consecutive snapshot.");
    expect(html).toContain("All AI coding tools operational across the past 7 days.");
  });

  it("omits the 'What moved' block entirely when inferences is undefined", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).not.toContain("What moved");
  });

  it("omits the block when inferences is an empty array", async () => {
    const empty = mkDigest({ inferences: [] });
    const html = await renderDigestHtml({ ...BASE, digest: empty });
    expect(html).not.toContain("What moved");
  });
});

describe("renderDigestHtml — translate pill (S60 Build 4)", () => {
  it("renders a translate link next to a non-English source item", async () => {
    const withGerman = mkDigest({
      sections: [
        {
          id: "tool-health",
          title: "AI Publishers",
          anchorSlug: "ai-publishers",
          mode: "diff",
          headline: "From Heise (Hannover)",
          items: [
            {
              headline: "KI-Modell mit Rekord-Trainingseffizienz",
              sourceLabel: "heise.de",
              sourceUrl: "https://www.heise.de/news/test",
              sourceLang: "de",
            },
          ],
          sourceUrls: ["https://www.heise.de/"],
        },
      ],
    });
    const html = await renderDigestHtml({ ...BASE, digest: withGerman });
    expect(html).toContain("Translate");
    expect(html).toContain("translate.google.com/translate");
    expect(html).toContain(encodeURIComponent("https://www.heise.de/news/test"));
  });

  it("does NOT render a translate link for English sources", async () => {
    const html = await renderDigestHtml(BASE);
    // BASE digest has English sources only.
    expect(html).not.toContain("translate.google.com");
  });
});

describe("renderDigestHtml — quiet mode", () => {
  it("renders a quiet-day digest without crashing on zero items", async () => {
    const quiet = mkDigest({
      mode: "quiet",
      subject: "Gawk — 2026-04-22 · all quiet in the AI ecosystem",
      greetingTemplate:
        "Good morning from Gawk — all quiet in the AI ecosystem in {geoCountry} and beyond.",
      sections: [
        {
          id: "tool-health",
          title: "Tool Health",
          anchorSlug: "tool-health",
          mode: "quiet",
          headline: "All tools operational",
          items: [],
          sourceUrls: [],
        },
      ],
    });
    const html = await renderDigestHtml({ ...BASE, digest: quiet });
    expect(html).toContain("All tools operational");
  });
});
