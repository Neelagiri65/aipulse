import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedReading } from "@/components/feed/FeedReading";
import { FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";

const card: Card = {
  id: "MODEL_MOVER-abc",
  type: "MODEL_MOVER",
  severity: 80,
  headline: "MiniMax: MiniMax M3 down 11 ranks on OpenRouter weekly",
  detail: "Now #16, was #5.",
  sourceName: "OpenRouter",
  sourceUrl: "https://openrouter.ai/rankings",
  timestamp: "2026-09-07T09:00:00Z",
  meta: { currentRank: 16, previousRank: 5, delta: 11 },
};

describe("FeedReading", () => {
  it("kicker, headline, the source's words, source link, permalink, why, actions", () => {
    const html = renderToStaticMarkup(<FeedReading card={card} nowMs={Date.parse("2026-09-07T10:00:00Z")} />);
    expect(html).toContain("Model mover · OpenRouter · 07/09/2026 09:00 UTC");
    expect(html).toContain("MiniMax: MiniMax M3 down 11 ranks");
    expect(html).toContain("Now #16, was #5.");
    expect(html).toMatch(/<a [^>]*href="https:\/\/openrouter\.ai\/rankings"[^>]*rel="noreferrer"/);
    expect(html).toContain("1h ago");
    expect(html).toContain('href="/feed/MODEL_MOVER-abc"');
    expect(html).toContain("Why this surfaced");
    expect(html).toContain(`more than ${FEED_TRIGGERS.MODEL_MOVER_RANK_DELTA} ranks`);
    expect(html).toContain("Open the source");
    expect(html).toContain("feed-share-MODEL_MOVER-abc");
  });

  it("a tool alert carries its state word with the outage tone only", () => {
    const html = renderToStaticMarkup(
      <FeedReading
        card={{ ...card, id: "t", type: "TOOL_ALERT", severity: 100, sourceName: "Anthropic Status", meta: { status: "major_outage", activeIncidents: 1 } }}
        nowMs={Date.parse("2026-09-07T10:00:00Z")}
      />,
    );
    expect(html).toContain('class="ap-word ap-word--out">a major outage<');
    expect(html).toContain("Anthropic Status reported a major outage with 1 active incident.");
  });

  it("a storied card names the other outlets and threads, each linked (live shape, 2026-09-24)", () => {
    const storied: Card = {
      ...card, id: "PRESS-muse", type: "PRESS", severity: 45, sourceName: "Heise Online",
      headline: "Tamagotchi trifft KI-Agent: Meta kündigt KI-Gadget Muse Charm an", detail: undefined,
      meta: { rssId: "d50da5fc14f3488a" },
      story: {
    sources: [
      { publisher: "latent.space", country: "US", lang: "en", url: "https://www.latent.space/p/ainews-meta-connect-2026-muse-glasses", timestamp: "2026-09-24T08:00:00.000Z" },
    ],
    discussion: [
      { site: "Hacker News", url: "https://news.ycombinator.com/item?id=1", points: 212, timestamp: "2026-09-24T09:00:00Z" },
    ],
  },
    };
    const html = renderToStaticMarkup(<FeedReading card={storied} nowMs={Date.parse("2026-09-24T10:00:00Z")} />);
    expect(html).toContain("Also reported by");
    expect(html).toContain('href="https://www.latent.space/p/ainews-meta-connect-2026-muse-glasses"');
    expect(html).toContain("Discussed on");
    expect(html).toContain("212 points");
  });

  it("a card without a story shows neither line", () => {
    const html = renderToStaticMarkup(<FeedReading card={card} nowMs={Date.parse("2026-09-07T10:00:00Z")} />);
    expect(html).not.toContain("Also reported by");
  });
  it("shows the source's words after the detail, and a machine summary labelled with its model", () => {
    const now = Date.parse("2026-09-07T10:00:00Z");
    const own = renderToStaticMarkup(<FeedReading card={{ ...card, summary: "MiniMax's flagship model." }} nowMs={now} />);
    expect(own).toMatch(/Now #16, was #5\.<\/p><section[^>]*data-summary-kind="source"/);
    expect(own).toContain("In their words");
    const machine = renderToStaticMarkup(
      <FeedReading
        card={{ ...card, type: "NEWS", machineSummary: { text: "A post about a model.", model: "openai/gpt-oss-20b", generatedAt: "2026-09-07T09:30:00Z" } }}
        nowMs={now}
      />,
    );
    expect(machine).toContain("Machine summary");
    expect(machine).toContain("Written by openai/gpt-oss-20b from the linked page");
    expect(machine).not.toContain("In their words");
  });
});
