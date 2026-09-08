/**
 * The Community surface leads with the Discord server.
 *
 * The tab carries the Discord mark; until now its body was GitHub repo activity, so the mark
 * promised one thing and the panel delivered another. These tests pin the contract of the panel
 * that closes that gap: the count is shown exactly as the widget reported it (a one-member server
 * says one), it is never shown when the route is not answering, it never travels without the
 * sentence saying what it does and does not mean, and the join link renders either way.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RoomsView } from "@/components/dashboard/RoomsView";
import type { CommunityState } from "@/lib/community/use-community";

const KEY = "NEXT_PUBLIC_COMMUNITY_URL";
process.env[KEY] = "https://discord.com/invite/hPkVzt9DHc";

const MEANING = "Members Discord counts as online right now, per the server widget. Includes bots.";

const answering: CommunityState = {
  data: {
    ok: true,
    serverName: "Gawk Dev",
    onlineCount: 1,
    countMeaning: MEANING,
    fetchedAt: "2026-09-08T08:30:00.000Z",
    source: {
      id: "discord-widget",
      name: "Discord — Gawk Dev server widget",
      url: "https://discord.com/api/guilds/1500564346001031309/widget.json",
    },
  },
  error: undefined,
  lastSuccessAt: 1,
  isInitialLoading: false,
};

const pending: CommunityState = {
  data: undefined,
  error: undefined,
  lastSuccessAt: undefined,
  isInitialLoading: true,
};

const failing: CommunityState = { ...answering, error: "/api/community returned 503" };

describe("RoomsView — the Discord server panel", () => {
  it("prints the count the widget reported, however small, with its meaning", () => {
    const html = renderToStaticMarkup(<RoomsView rows={[]} community={answering} />);
    expect(html).toContain("1 online now in Gawk Dev");
    expect(html).toContain(MEANING);
    expect(html).toContain('data-community-state="ok"');
  });

  it("shows the join link whether or not the widget answers", () => {
    for (const state of [answering, pending, failing]) {
      const html = renderToStaticMarkup(<RoomsView rows={[]} community={state} />);
      expect(html).toContain("https://discord.com/invite/hPkVzt9DHc");
      expect(html).toContain('data-testid="community-join"');
    }
  });

  it("shows no count while the first poll is in flight", () => {
    const html = renderToStaticMarkup(<RoomsView rows={[]} community={pending} />);
    expect(html).toContain("Reading the Discord widget…");
    expect(html).toContain('data-community-state="pending"');
    expect(html).not.toContain("0 online");
  });

  it("withholds the count when the latest poll failed, rather than carrying the last one forward", () => {
    const html = renderToStaticMarkup(<RoomsView rows={[]} community={failing} />);
    expect(html).toContain("the widget is not answering");
    expect(html).toContain('data-community-state="unavailable"');
    expect(html).not.toContain("1 online now");
  });

  it("keeps the GitHub panel as its own measure with its own caption", () => {
    const html = renderToStaticMarkup(<RoomsView rows={[]} community={answering} />);
    expect(html).toContain("Active now · repos with AI config");
    expect(html).toContain("public events only, so this is a floor, not a census");
    expect(html).toContain("A different measure from the count above");
  });

  it("renders the server panel as pending when no poll is passed at all", () => {
    const html = renderToStaticMarkup(<RoomsView rows={[]} />);
    expect(html).toContain('data-community-state="pending"');
  });
});
