/**
 * /api/community — route contract with a recorded widget.json shape.
 *
 * Fixture is the live payload observed 2026-09-05 (usernames replaced),
 * so the "strips members + instant_invite" assertion is against the real
 * shape, not a guess.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEGRADED_CACHE,
  GET,
  OK_CACHE,
  handleGetCommunity,
  type CommunityDeps,
} from "@/app/api/community/route";

const RECORDED_WIDGET = {
  id: "1500564346001031309",
  name: "Gawk Dev",
  instant_invite: "https://discord.com/invite/D9SkBd8b",
  channels: [{ id: "1500564349113073727", name: "General", position: 0 }],
  members: [
    {
      id: "0",
      username: "someone",
      discriminator: "0000",
      avatar: null,
      status: "online",
      avatar_url: "https://cdn.discordapp.com/widget-avatars/x",
    },
  ],
  presence_count: 1,
};

const NOW = new Date("2026-09-05T11:30:00.000Z");

function res(status: number, body: unknown, ok = status < 400): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

function deps(fetchWidget: CommunityDeps["fetchWidget"]): CommunityDeps {
  return { fetchWidget, now: () => NOW };
}

const ORIGINAL_FETCH = global.fetch;
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("handleGetCommunity", () => {
  it("returns the minimal DTO with meaning, time, and source on success", async () => {
    const out = await handleGetCommunity(deps(async () => res(200, RECORDED_WIDGET)));
    expect(out.status).toBe(200);
    expect(out.cacheHeader).toBe(OK_CACHE);
    expect(out.body.ok).toBe(true);
    if (out.body.ok) {
      expect(out.body.serverName).toBe("Gawk Dev");
      expect(out.body.onlineCount).toBe(1);
      expect(out.body.countMeaning).toMatch(/includes bots/i);
      expect(out.body.fetchedAt).toBe(NOW.toISOString());
      expect(out.body.source.id).toBe("discord-widget");
      expect(out.body.source.url).toMatch(/widget\.json$/);
    }
    // Nothing personal or widget-specific leaks through.
    const json = JSON.stringify(out.body);
    expect(json).not.toContain("members");
    expect(json).not.toContain("someone");
    expect(json).not.toContain("D9SkBd8b");
    expect(json).not.toContain("avatar");
  });

  it("reports widget-disabled on Discord 403 code 50004, cached briefly", async () => {
    const out = await handleGetCommunity(
      deps(async () => res(403, { message: "Widget Disabled", code: 50004 })),
    );
    expect(out.status).toBe(503);
    expect(out.cacheHeader).toBe(DEGRADED_CACHE);
    expect(out.body.ok).toBe(false);
    if (!out.body.ok) expect(out.body.reason).toBe("widget-disabled");
  });

  it("reports upstream-error on any other non-2xx", async () => {
    const out = await handleGetCommunity(deps(async () => res(500, null)));
    expect(out.status).toBe(503);
    if (!out.body.ok) expect(out.body.reason).toBe("upstream-error");
  });

  it("reports upstream-error when fetch throws", async () => {
    const out = await handleGetCommunity(
      deps(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    expect(out.status).toBe(503);
    if (!out.body.ok) {
      expect(out.body.reason).toBe("upstream-error");
      expect(out.body.message).toBe("ECONNRESET");
    }
  });

  it("reports invalid-payload when the body fails the sanity range", async () => {
    const out = await handleGetCommunity(
      deps(async () => res(200, { name: "Gawk Dev", presence_count: 5_000_000 })),
    );
    expect(out.status).toBe(503);
    if (!out.body.ok) expect(out.body.reason).toBe("invalid-payload");
  });

  it("degraded responses still carry fetchedAt and the source", async () => {
    const out = await handleGetCommunity(deps(async () => res(500, null)));
    expect(out.body.fetchedAt).toBe(NOW.toISOString());
    expect(out.body.source.id).toBe("discord-widget");
  });
});

describe("GET", () => {
  it("applies the cache header and status to the HTTP response", async () => {
    global.fetch = vi.fn().mockResolvedValue(res(200, RECORDED_WIDGET)) as unknown as typeof fetch;
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe(OK_CACHE);
    const body = (await r.json()) as { ok: boolean; onlineCount?: number };
    expect(body.ok).toBe(true);
    expect(body.onlineCount).toBe(1);
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toMatch(/discord\.com\/api\/guilds\/\d+\/widget\.json$/);
  });

  it("returns 503 with the degraded cache header when the widget is off", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(res(403, { code: 50004 })) as unknown as typeof fetch;
    const r = await GET();
    expect(r.status).toBe(503);
    expect(r.headers.get("Cache-Control")).toBe(DEGRADED_CACHE);
  });
});
