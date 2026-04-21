import { describe, expect, it } from "vitest";
import { renderDigestHtml } from "@/lib/email/templates/digest";
import type { DigestBody } from "@/lib/digest/types";

function mkDigest(overrides: Partial<DigestBody> = {}): DigestBody {
  return {
    date: "2026-04-22",
    subject: "AI Pulse — 2026-04-22 · 1 tool incident",
    mode: "diff",
    greetingTemplate:
      "Good morning from AI Pulse — here's what moved in {geoCountry} and beyond in the last 24h.",
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
  baseUrl: "https://aipulse.dev",
  unsubUrl: "https://aipulse.dev/api/subscribe/unsubscribe?token=tok-abc",
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
    expect(html).toContain("AI Pulse — 2026-04-22");
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
  it("emits a 'View on AI Pulse' deep link with the section anchor", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain(
      "https://aipulse.dev/digest/2026-04-22#tool-health",
    );
    expect(html).toContain(
      "https://aipulse.dev/digest/2026-04-22#benchmarks",
    );
    expect(html).toContain("View on AI Pulse");
  });

  it("emits LinkedIn and X share links per section", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("linkedin.com/sharing/share-offsite/");
    expect(html).toContain("x.com/intent/tweet");
  });

  it("share URLs include the section anchor in the encoded url param", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toMatch(
      /linkedin\.com\/sharing\/share-offsite\/\?url=https%3A%2F%2Faipulse\.dev%2Fdigest%2F2026-04-22%23tool-health/,
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

describe("renderDigestHtml — footer", () => {
  it("includes the per-recipient unsubscribe URL", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain(
      "https://aipulse.dev/api/subscribe/unsubscribe?token=tok-abc",
    );
    expect(html).toContain("Unsubscribe");
  });

  it("includes the privacy link", async () => {
    const html = await renderDigestHtml(BASE);
    expect(html).toContain("https://aipulse.dev/privacy");
  });
});

describe("renderDigestHtml — quiet mode", () => {
  it("renders a quiet-day digest without crashing on zero items", async () => {
    const quiet = mkDigest({
      mode: "quiet",
      subject: "AI Pulse — 2026-04-22 · all quiet in the AI ecosystem",
      greetingTemplate:
        "Good morning from AI Pulse — all quiet in the AI ecosystem in {geoCountry} and beyond.",
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
