/**
 * Discord server widget — pure parse + types.
 *
 * Source of truth for the endpoint is `DISCORD_WIDGET` in data-sources.ts.
 * This module turns the raw widget.json into the minimal DTO Gawk shows:
 * the server name and how many members Discord counts as online. The
 * `members` array (real usernames + avatar URLs) and the widget's own
 * `instant_invite` are deliberately not carried — the join link is the
 * permanent invite in `NEXT_PUBLIC_COMMUNITY_URL`.
 *
 * No network here; the route owns fetch + caching so this stays testable.
 */

import { DISCORD_WIDGET } from "@/lib/data-sources";

export const DISCORD_WIDGET_API_URL: string = DISCORD_WIDGET.apiUrl ?? "";

/** Discord's error code when the server widget is disabled. */
export const DISCORD_WIDGET_DISABLED_CODE = 50004;

/** What `onlineCount` does and does not mean — shown next to the number. */
export const ONLINE_COUNT_MEANING =
  "Members Discord counts as online right now, per the server widget. Includes bots. Not a measure of activity.";

export type CommunityDto = {
  ok: true;
  serverName: string;
  onlineCount: number;
  countMeaning: string;
  /** ISO time the widget was read by the route. */
  fetchedAt: string;
  source: { id: string; name: string; url: string };
};

export type CommunityDegradedReason =
  | "widget-disabled"
  | "upstream-error"
  | "invalid-payload";

export type CommunityDegraded = {
  ok: false;
  reason: CommunityDegradedReason;
  message: string;
  fetchedAt: string;
  source: { id: string; name: string; url: string };
};

export type CommunityResponse = CommunityDto | CommunityDegraded;

export type ParsedWidget =
  | { ok: true; serverName: string; onlineCount: number }
  | { ok: false; reason: "invalid-payload"; message: string };

/**
 * Parse a widget.json body. Enforces the pre-committed sanity range from
 * the registry: a count outside it is reported as invalid, never shown.
 */
export function parseDiscordWidget(json: unknown): ParsedWidget {
  if (!json || typeof json !== "object") {
    return { ok: false, reason: "invalid-payload", message: "widget body is not an object" };
  }
  const o = json as Record<string, unknown>;
  const name = o.name;
  const count = o.presence_count;
  if (typeof name !== "string" || name.length === 0) {
    return { ok: false, reason: "invalid-payload", message: "widget body has no server name" };
  }
  if (typeof count !== "number" || !Number.isInteger(count)) {
    return { ok: false, reason: "invalid-payload", message: "presence_count is not an integer" };
  }
  const min = DISCORD_WIDGET.sanityCheck.expectedMin ?? 0;
  const max = DISCORD_WIDGET.sanityCheck.expectedMax ?? Number.MAX_SAFE_INTEGER;
  if (count < min || count > max) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `presence_count ${count} outside the sanity range ${min}–${max}`,
    };
  }
  return { ok: true, serverName: name, onlineCount: count };
}

export function sourceRef(): CommunityDto["source"] {
  return { id: DISCORD_WIDGET.id, name: DISCORD_WIDGET.name, url: DISCORD_WIDGET_API_URL };
}
