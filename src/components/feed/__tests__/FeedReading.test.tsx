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
});
