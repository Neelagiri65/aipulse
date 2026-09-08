/**
 * FeedView — the shared community poll becomes a "Discuss" link on the selected card's reading
 * surface, only while the route is answering, the join URL is configured, and the card is a tool
 * alert. (#106 put it on every alert row; the feed became list-plus-reading-surface, so the link
 * lives where the card is actually read. The rule it encodes is unchanged: no invite next to a
 * number the route did not just return.)
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedView } from "@/components/feed/FeedView";
import type { CommunityState } from "@/lib/community/use-community";
import type { FeedResponse } from "@/lib/feed/types";

const response: FeedResponse = {
  cards: [
    {
      id: "TOOL_ALERT-x-1",
      type: "TOOL_ALERT",
      severity: 100,
      headline: "Cursor is reporting a major outage",
      sourceName: "Cursor Status",
      sourceUrl: "https://status.cursor.com",
      timestamp: "2026-09-05T11:00:00.000Z",
      meta: {},
    },
    {
      id: "NEWS-x-1",
      type: "NEWS",
      severity: 40,
      headline: "A story",
      sourceName: "HN",
      sourceUrl: "https://news.ycombinator.com",
      timestamp: "2026-09-05T11:00:00.000Z",
      meta: {},
    },
  ],
  quietDay: false,
  currentState: {
    topModel: { name: "x", sourceUrl: "https://openrouter.ai" },
    toolHealth: { operational: 5, degraded: 1, total: 6 },
    latestPaper: { title: "t", sourceUrl: "https://arxiv.org" },
  },
  lastComputed: "2026-09-05T11:30:00.000Z",
};

const answering: CommunityState = {
  data: {
    ok: true,
    serverName: "Gawk Dev",
    onlineCount: 2,
    countMeaning: "Members Discord counts as online right now. Includes bots.",
    fetchedAt: "2026-09-05T11:30:00.000Z",
    source: { id: "discord-widget", name: "Discord — Gawk Dev server widget", url: "https://discord.com/api/guilds/1/widget.json" },
  },
  error: undefined,
  lastSuccessAt: 1,
  isInitialLoading: false,
};

const KEY = "NEXT_PUBLIC_COMMUNITY_URL";
const ORIG = process.env[KEY];
afterEach(() => {
  if (ORIG === undefined) delete process.env[KEY];
  else process.env[KEY] = ORIG;
});

describe("FeedView — community discuss", () => {
  it("adds the link to the alert's reading surface, once, while the route answers", () => {
    process.env[KEY] = "https://discord.gg/test-invite";
    const html = renderToStaticMarkup(
      <FeedView initialResponse={response} disablePolling community={answering} />,
    );
    // The tool alert is first, so it is the selected card on a fresh render.
    expect(html.match(/data-testid="feed-reading-discuss"/g)?.length ?? 0).toBe(1);
    expect(html).toContain("2 online on Discord");
    // The number never travels without the sentence that says what it is.
    expect(html).toContain("Members Discord counts as online right now");
  });

  it("does not add the link to a non-alert card's reading surface", () => {
    process.env[KEY] = "https://discord.gg/test-invite";
    const newsOnly = { ...response, cards: [response.cards[1]] };
    const html = renderToStaticMarkup(
      <FeedView initialResponse={newsOnly} disablePolling community={answering} />,
    );
    expect(html).not.toContain("feed-reading-discuss");
  });

  it("does not render the link on the mobile variant, which has no reading surface", () => {
    process.env[KEY] = "https://discord.gg/test-invite";
    const html = renderToStaticMarkup(
      <FeedView initialResponse={response} disablePolling variant="mobile" community={answering} />,
    );
    expect(html).not.toContain("feed-reading-discuss");
  });

  it("hides the link when the latest poll failed, even with retained data", () => {
    process.env[KEY] = "https://discord.gg/test-invite";
    const html = renderToStaticMarkup(
      <FeedView
        initialResponse={response}
        disablePolling
        community={{ ...answering, error: "/api/community returned 503" }}
      />,
    );
    expect(html).not.toContain("feed-reading-discuss");
  });

  it("hides the link when no community URL is configured", () => {
    delete process.env[KEY];
    delete process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
    const html = renderToStaticMarkup(
      <FeedView initialResponse={response} disablePolling community={answering} />,
    );
    expect(html).not.toContain("feed-reading-discuss");
  });

  it("renders unchanged when no community state is passed", () => {
    const html = renderToStaticMarkup(<FeedView initialResponse={response} disablePolling />);
    expect(html).not.toContain("feed-reading-discuss");
    expect(html).toContain("Cursor is reporting a major outage");
  });
});
