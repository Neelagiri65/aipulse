import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommunityCard } from "@/components/community/CommunityCard";
import type { CommunityDto } from "@/lib/community/discord-widget";

const dto: CommunityDto = {
  ok: true,
  serverName: "Gawk Dev",
  onlineCount: 7,
  countMeaning: "Members Discord counts as online right now. Includes bots.",
  fetchedAt: "2026-09-05T11:30:00.000Z",
  source: { id: "discord-widget", name: "Discord — Gawk Dev server widget", url: "https://discord.com/api/guilds/1/widget.json" },
};
const JOIN = "https://discord.gg/test-invite";

describe("CommunityCard", () => {
  it("ok: shows the count, its meaning, the source, the read time, and the join link", () => {
    const html = renderToStaticMarkup(
      <CommunityCard data={dto} error={undefined} isInitialLoading={false} joinUrl={JOIN} />,
    );
    expect(html).toContain('data-community-state="ok"');
    expect(html).toContain(">7<");
    expect(html).toContain("online on Discord now");
    expect(html).toContain("Includes bots.");
    expect(html).toContain("Discord — Gawk Dev server widget");
    expect(html).toContain("as of 11:30 UTC");
    expect(html).toContain(`href="${JOIN}"`);
  });

  it("unavailable: no live number, join link still present", () => {
    const html = renderToStaticMarkup(
      <CommunityCard data={undefined} error="503" isInitialLoading={false} joinUrl={JOIN} />,
    );
    expect(html).toContain('data-community-state="unavailable"');
    expect(html).toContain("online count unavailable");
    expect(html).not.toContain("online on Discord now");
    expect(html).toContain('data-testid="community-card-join"');
  });

  it("unavailable with retained data: last known count carries its time", () => {
    const html = renderToStaticMarkup(
      <CommunityCard data={dto} error="503" isInitialLoading={false} joinUrl={JOIN} />,
    );
    expect(html).toContain("last known 7 online · as of 11:30 UTC");
    expect(html).not.toContain('data-community-state="ok"');
  });

  it("loading: connecting state, no number", () => {
    const html = renderToStaticMarkup(
      <CommunityCard data={undefined} error={undefined} isInitialLoading joinUrl={undefined} />,
    );
    expect(html).toContain("connecting…");
    expect(html).not.toContain("community-card-join");
  });
});
