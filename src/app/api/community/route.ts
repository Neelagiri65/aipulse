/**
 * /api/community — how many members are online in the Gawk Dev Discord.
 *
 * Reads the public server widget (`DISCORD_WIDGET` in data-sources.ts),
 * strips everything but the server name and `presence_count`, and returns
 * a DTO that carries its own meaning line, fetch time, and source.
 *
 * Cache: public s-maxage=300 / SWR=60 on success — every client polls at
 * the same 5-minute cadence, so the CDN absorbs the fan-out and Discord
 * sees one request per region per window. Zero Redis.
 *
 * Degraded (503): the widget is disabled (Discord 403, code 50004), the
 * upstream failed, or the body failed the sanity range. Cached for 60 s
 * rather than `no-store` — a disabled widget is a stable state and an
 * uncached 503 would forward every client poll straight to Discord.
 *
 * Runtime is nodejs to match every other route in the repo (PRD §23 said
 * edge; there is no edge route here yet and nothing in this handler
 * needs one).
 */

import { NextResponse } from "next/server";
import {
  DISCORD_WIDGET_API_URL,
  DISCORD_WIDGET_DISABLED_CODE,
  ONLINE_COUNT_MEANING,
  parseDiscordWidget,
  sourceRef,
  type CommunityResponse,
} from "@/lib/community/discord-widget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CommunityDeps = {
  fetchWidget: () => Promise<Response>;
  now: () => Date;
};

const DEFAULT_DEPS: CommunityDeps = {
  fetchWidget: () =>
    fetch(DISCORD_WIDGET_API_URL, {
      headers: { "User-Agent": "gawk.dev-community/1.0 (+https://gawk.dev)" },
      cache: "no-store",
    }),
  now: () => new Date(),
};

export const OK_CACHE = "public, s-maxage=300, stale-while-revalidate=60";
export const DEGRADED_CACHE = "public, s-maxage=60, stale-while-revalidate=60";

/** Pure handler — injected deps for tests. Returns body + status + cache header. */
export async function handleGetCommunity(
  deps: CommunityDeps = DEFAULT_DEPS,
): Promise<{ body: CommunityResponse; status: number; cacheHeader: string }> {
  const fetchedAt = deps.now().toISOString();
  const source = sourceRef();
  const degraded = (
    reason: "widget-disabled" | "upstream-error" | "invalid-payload",
    message: string,
  ) => ({
    body: { ok: false as const, reason, message, fetchedAt, source },
    status: 503,
    cacheHeader: DEGRADED_CACHE,
  });

  let res: Response;
  try {
    res = await deps.fetchWidget();
  } catch (err) {
    return degraded("upstream-error", err instanceof Error ? err.message : String(err));
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const code =
      json && typeof json === "object" ? (json as { code?: unknown }).code : undefined;
    if (res.status === 403 && code === DISCORD_WIDGET_DISABLED_CODE) {
      return degraded("widget-disabled", "Discord server widget is disabled (code 50004)");
    }
    return degraded("upstream-error", `widget.json returned ${res.status}`);
  }

  const parsed = parseDiscordWidget(json);
  if (!parsed.ok) return degraded(parsed.reason, parsed.message);

  return {
    body: {
      ok: true,
      serverName: parsed.serverName,
      onlineCount: parsed.onlineCount,
      countMeaning: ONLINE_COUNT_MEANING,
      fetchedAt,
      source,
    },
    status: 200,
    cacheHeader: OK_CACHE,
  };
}

export async function GET() {
  const { body, status, cacheHeader } = await handleGetCommunity();
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": cacheHeader },
  });
}
