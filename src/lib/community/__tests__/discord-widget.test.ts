import { describe, expect, it } from "vitest";
import { DISCORD_WIDGET } from "@/lib/data-sources";
import {
  DISCORD_WIDGET_API_URL,
  parseDiscordWidget,
} from "@/lib/community/discord-widget";

describe("parseDiscordWidget", () => {
  it("keeps only name + presence_count from a real-shaped payload", () => {
    const r = parseDiscordWidget({
      id: "1500564346001031309",
      name: "Gawk Dev",
      instant_invite: "https://discord.com/invite/D9SkBd8b",
      channels: [{ id: "1", name: "General", position: 0 }],
      members: [{ id: "0", username: "Gawk Dev", status: "online" }],
      presence_count: 1,
    });
    expect(r).toEqual({ ok: true, serverName: "Gawk Dev", onlineCount: 1 });
  });

  it("rejects a body that is not an object", () => {
    expect(parseDiscordWidget(null).ok).toBe(false);
    expect(parseDiscordWidget("x").ok).toBe(false);
  });

  it("rejects a missing server name", () => {
    const r = parseDiscordWidget({ presence_count: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/server name/);
  });

  it("rejects a non-integer presence_count", () => {
    expect(parseDiscordWidget({ name: "x", presence_count: "3" }).ok).toBe(false);
    expect(parseDiscordWidget({ name: "x", presence_count: 1.5 }).ok).toBe(false);
  });

  it("enforces the registry sanity range", () => {
    const max = DISCORD_WIDGET.sanityCheck.expectedMax ?? 0;
    expect(parseDiscordWidget({ name: "x", presence_count: max }).ok).toBe(true);
    const over = parseDiscordWidget({ name: "x", presence_count: max + 1 });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toMatch(/sanity range/);
    expect(parseDiscordWidget({ name: "x", presence_count: -1 }).ok).toBe(false);
  });

  it("reads the endpoint from the registry (single source of truth)", () => {
    expect(DISCORD_WIDGET_API_URL).toBe(DISCORD_WIDGET.apiUrl);
    expect(DISCORD_WIDGET_API_URL).toMatch(/^https:\/\/discord\.com\/api\/guilds\/\d+\/widget\.json$/);
    expect(DISCORD_WIDGET.verifiedAt).not.toBe("");
    expect(DISCORD_WIDGET.category).toBe("community-presence");
  });
});
