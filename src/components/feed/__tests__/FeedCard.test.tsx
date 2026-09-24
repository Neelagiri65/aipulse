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
    story: partial.story,
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

describe("FeedCard — discuss affordance", () => {
  const discuss = {
    url: "https://discord.gg/test-invite",
    onlineCount: 3,
    asOf: "2026-09-05T11:30:00.000Z",
    meaning: "Members Discord counts as online right now. Includes bots.",
  };

  it("renders Discuss · n online on Discord on TOOL_ALERT cards when provided", () => {
    const html = renderToStaticMarkup(
      <FeedCard card={card({ type: "TOOL_ALERT", severity: 100 })} discuss={discuss} />,
    );
    expect(html).toContain('data-testid="feed-card-discuss"');
    expect(html).toContain("Discuss · 3 online on Discord · incl. bots");
    expect(html).toContain('href="https://discord.gg/test-invite"');
    expect(html).toContain("As of 11:30 UTC");
  });

  it("does not render it on non-alert cards", () => {
    const html = renderToStaticMarkup(
      <FeedCard card={card({ type: "NEWS", severity: 40 })} discuss={discuss} />,
    );
    expect(html).not.toContain("feed-card-discuss");
  });

  it("does not render it when the community route is not answering", () => {
    const html = renderToStaticMarkup(
      <FeedCard card={card({ type: "TOOL_ALERT", severity: 100 })} discuss={null} />,
    );
    expect(html).not.toContain("feed-card-discuss");
  });

  describe("a card carrying a story", () => {
    const src = (publisher: string, n: number) => ({
      publisher, country: "US", lang: "en", url: `https://example.com/${n}`, timestamp: "2026-09-22T18:00:00.000Z",
    });
    const storied = card({
      type: "PRESS", severity: 45, headline: "Anthropic veröffentlicht Claude Opus 5.5", sourceName: "Heise Online",
      story: {
        sources: [src("MarkTechPost", 1), src("Analytics Vidhya", 2), src("latent.space", 3), src("The Register", 4), src("MIT TR", 5)],
        discussion: [
          { site: "Hacker News", url: "https://news.ycombinator.com/item?id=1", points: 120, timestamp: "2026-09-22T20:00:00Z" },
          { site: "r/LocalLLaMA", url: "https://reddit.com/r/LocalLLaMA/x", points: null, timestamp: "2026-09-22T21:00:00Z" },
        ],
      },
    });

    it("lists the other outlets as links, the first three by name and the rest as a count", () => {
      const html = renderToStaticMarkup(<FeedCard card={storied} showShare={false} />);
      expect(html).toContain("Also reported by");
      for (const n of [1, 2, 3]) expect(html).toContain(`href="https://example.com/${n}"`);
      expect(html).toContain("MarkTechPost");
      expect(html).not.toContain(`href="https://example.com/4"`);
      expect(html).toContain("+2 more");
    });

    it("lists the discussion threads, saying what a number counts", () => {
      const html = renderToStaticMarkup(<FeedCard card={storied} showShare={false} />);
      expect(html).toContain("Discussed on");
      expect(html).toContain('href="https://news.ycombinator.com/item?id=1"');
      expect(html).toContain("120 points");
      expect(html).toContain("r/LocalLLaMA");
    });

    it("renders neither line for a card without a story", () => {
      const html = renderToStaticMarkup(<FeedCard card={card({ type: "PRESS", severity: 45 })} showShare={false} />);
      expect(html).not.toContain("Also reported by");
      expect(html).not.toContain("Discussed on");
    });
  });
});
