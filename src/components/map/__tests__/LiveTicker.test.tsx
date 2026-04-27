import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { LiveTicker } from "@/components/map/LiveTicker";
import type { WireItem } from "@/components/dashboard/WirePage";

const NOW = new Date("2026-04-28T12:00:00.000Z").getTime();

const sample: WireItem[] = [
  {
    kind: "gh",
    eventId: "evt-1",
    type: "PushEvent",
    actor: "alice",
    repo: "anthropics/claude-code",
    createdAt: "2026-04-28T11:58:00.000Z",
    hasAiConfig: true,
  },
  {
    kind: "hn",
    id: "39426255",
    createdAt: "2026-04-28T11:00:00.000Z",
    title: "Show HN: cool thing",
    author: "user",
    points: 142,
    numComments: 33,
    hnUrl: "https://news.ycombinator.com/item?id=39426255",
    locationLabel: null,
  },
];

describe("LiveTicker", () => {
  it("renders an empty state when given zero rows", () => {
    const html = renderToStaticMarkup(<LiveTicker rows={[]} nowMs={NOW} />);
    expect(html).toContain("ap-live-ticker--empty");
    expect(html).toContain("awaiting first events");
  });

  it("renders each row twice for the seamless scroll loop", () => {
    const html = renderToStaticMarkup(
      <LiveTicker rows={sample} nowMs={NOW} />,
    );
    // Each event should appear in both copies — count occurrences
    // of an item-stable string.
    const occurrences = html.split("PushEvent".replace("Event", "")).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("links HN entries to the canonical hnUrl with rel=noreferrer", () => {
    const html = renderToStaticMarkup(
      <LiveTicker rows={sample} nowMs={NOW} />,
    );
    expect(html).toMatch(
      /href="https:\/\/news\.ycombinator\.com\/item\?id=39426255"/,
    );
    expect(html).toContain('rel="noreferrer"');
  });

  it("shows GH actor and repo metadata for gh entries", () => {
    const html = renderToStaticMarkup(
      <LiveTicker rows={sample} nowMs={NOW} />,
    );
    expect(html).toContain("@alice");
    expect(html).toContain("anthropics/claude-code");
  });

  it("renders relative-age strings, not raw ISO timestamps", () => {
    const html = renderToStaticMarkup(
      <LiveTicker rows={sample} nowMs={NOW} />,
    );
    expect(html).toContain("ago");
    expect(html).not.toContain("2026-04-28T11:58");
  });

  it("caps visible items at 15 (TICKER_LIMIT)", () => {
    const many: WireItem[] = Array.from({ length: 30 }, (_, i) => ({
      kind: "gh" as const,
      eventId: `evt-${i}`,
      type: "PushEvent",
      actor: `user${i}`,
      repo: `repo/${i}`,
      createdAt: "2026-04-28T11:58:00.000Z",
      hasAiConfig: false,
    }));
    const html = renderToStaticMarkup(
      <LiveTicker rows={many} nowMs={NOW} />,
    );
    // 15 items × 2 copies = 30 occurrences max of the actor handle pattern
    const matches = html.match(/@user\d+/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(30);
  });
});
