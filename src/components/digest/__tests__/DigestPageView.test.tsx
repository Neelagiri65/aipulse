import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DigestPageView } from "@/components/digest/DigestPageView";
import type { DigestBody } from "@/lib/digest/types";

// The SectionShareButton pulls in @/lib/analytics which touches
// window/document APIs at render time on click; at the initial render
// we only need it to produce its static HTML, so stub the track call.
vi.mock("@/lib/analytics", () => ({ track: () => {} }));

function mkDigest(overrides: Partial<DigestBody> = {}): DigestBody {
  return {
    date: "2026-04-22",
    subject: "AI Pulse — 2026-04-22 · 1 tool incident",
    mode: "diff",
    greetingTemplate: "Good morning from AI Pulse.",
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
            detail: "45min impact",
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

function render(digest: DigestBody, baseUrl = "https://aipulse.dev"): string {
  return renderToStaticMarkup(
    <DigestPageView digest={digest} baseUrl={baseUrl} />,
  );
}

describe("DigestPageView — header", () => {
  it("renders the subject as H1", () => {
    const html = render(mkDigest());
    expect(html).toContain("AI Pulse — 2026-04-22 · 1 tool incident");
  });

  it("shows a diff-mode description by default", () => {
    const html = render(mkDigest({ mode: "diff" }));
    expect(html).toContain("Five verifiable things");
  });

  it("shows a quiet-mode description in quiet mode", () => {
    const html = render(mkDigest({ mode: "quiet" }));
    expect(html).toContain("Nothing meaningful moved");
  });

  it("shows a bootstrap description on first-day mode", () => {
    const html = render(mkDigest({ mode: "bootstrap" }));
    expect(html).toContain("First-day snapshot");
  });
});

describe("DigestPageView — sections", () => {
  it("renders each section as an element with the anchor slug as id", () => {
    const html = render(mkDigest());
    expect(html).toContain('id="tool-health"');
    expect(html).toContain('id="benchmarks"');
  });

  it("renders section titles and headlines", () => {
    const html = render(mkDigest());
    expect(html).toContain("Tool Health");
    expect(html).toContain("1 incident on Anthropic in the last 24h");
  });

  it("renders section-level source links", () => {
    const html = render(mkDigest());
    expect(html).toContain("https://status.anthropic.com/");
    expect(html).toContain("https://lmarena.ai/");
  });
});

describe("DigestPageView — items", () => {
  it("renders item headlines and details", () => {
    const html = render(mkDigest());
    expect(html).toContain("Anthropic — partial API outage");
    expect(html).toContain("45min impact");
  });

  it("renders per-item source with label when provided", () => {
    const html = render(mkDigest());
    expect(html).toContain("status.anthropic.com");
  });
});

describe("DigestPageView — share affordances", () => {
  it("renders LinkedIn and X share links on each section", () => {
    const html = render(mkDigest());
    const liCount = (
      html.match(/linkedin\.com\/sharing\/share-offsite/g) ?? []
    ).length;
    const xCount = (html.match(/x\.com\/intent\/tweet/g) ?? []).length;
    expect(liCount).toBe(2);
    expect(xCount).toBe(2);
  });

  it("share URLs target the section anchor, not just the page root", () => {
    const html = render(mkDigest());
    expect(html).toContain(
      encodeURIComponent("https://aipulse.dev/digest/2026-04-22#tool-health"),
    );
  });

  it("renders an anchor link button per section", () => {
    const html = render(mkDigest());
    // The pill-button href is "#{slug}"; count those rather than the
    // text "Anchor link" which also appears in the per-section aria-label.
    const matches = html.match(/href="#(tool-health|benchmarks)"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("DigestPageView — footer", () => {
  it("renders the generatedAt time in the footer", () => {
    const html = render(mkDigest());
    expect(html).toContain("Every number traces to a public source.");
    // The toUTCString conversion includes a weekday.
    expect(html).toMatch(/Wed, 22 Apr 2026/);
  });
});
