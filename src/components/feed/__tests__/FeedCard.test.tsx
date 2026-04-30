import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FeedCard } from "@/components/feed/FeedCard";
import type { Card } from "@/lib/feed/types";

function card(partial: Partial<Card> & Pick<Card, "type" | "severity">): Card {
  return {
    id: partial.id ?? "TEST-id-bucket",
    type: partial.type,
    severity: partial.severity,
    headline: partial.headline ?? "Test headline",
    detail: partial.detail,
    sourceName: partial.sourceName ?? "Test Source",
    sourceUrl: partial.sourceUrl ?? "https://example.com",
    timestamp: partial.timestamp ?? "2026-04-27T12:00:00.000Z",
    meta: partial.meta ?? {},
  };
}

describe("FeedCard", () => {
  it("renders the headline", () => {
    const html = renderToStaticMarkup(
      <FeedCard
        card={card({
          type: "TOOL_ALERT",
          severity: 100,
          headline: "Claude Code is reporting a major outage",
        })}
      />,
    );
    expect(html).toContain("Claude Code is reporting a major outage");
  });

  it("renders the source link as a clickable anchor with rel='noreferrer'", () => {
    const html = renderToStaticMarkup(
      <FeedCard
        card={card({
          type: "TOOL_ALERT",
          severity: 100,
          sourceName: "Anthropic Status",
          sourceUrl: "https://status.claude.com",
        })}
      />,
    );
    expect(html).toMatch(/<a [^>]*href="https:\/\/status\.claude\.com"/);
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Anthropic Status");
  });

  it("attaches a severity-tagged data attribute so CSS can style by tier", () => {
    const html = renderToStaticMarkup(
      <FeedCard card={card({ type: "MODEL_MOVER", severity: 80 })} />,
    );
    expect(html).toContain('data-severity="80"');
    expect(html).toContain('data-card-type="MODEL_MOVER"');
  });

  it("renders the optional detail line when provided", () => {
    const html = renderToStaticMarkup(
      <FeedCard
        card={card({
          type: "MODEL_MOVER",
          severity: 80,
          detail: "Now #2, was #9.",
        })}
      />,
    );
    expect(html).toContain("Now #2, was #9.");
  });

  it("does NOT render a detail block when detail is absent", () => {
    const html = renderToStaticMarkup(
      <FeedCard
        card={card({ type: "RESEARCH", severity: 20, detail: undefined })}
      />,
    );
    // detail wrapper should not be present
    expect(html).not.toContain('class="ap-feed-card-detail"');
  });

  it("renders the share button by default (S48g)", () => {
    const html = renderToStaticMarkup(
      <FeedCard
        card={card({ type: "TOOL_ALERT", severity: 100, id: "share-test" })}
      />,
    );
    expect(html).toContain('data-testid="feed-share-share-test"');
    // LinkedIn + X intents and a Copy button are all present.
    expect(html).toMatch(/linkedin\.com\/sharing\/share-offsite/);
    expect(html).toMatch(/x\.com\/intent\/tweet/);
    expect(html).toContain(">Copy<");
  });

  it("hides the share button when showShare={false}", () => {
    const html = renderToStaticMarkup(
      <FeedCard
        card={card({ type: "RESEARCH", severity: 20, id: "no-share" })}
        showShare={false}
      />,
    );
    expect(html).not.toContain('data-testid="feed-share-no-share"');
    expect(html).not.toContain("linkedin.com");
  });
});
