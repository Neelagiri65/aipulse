"use client";

/**
 * useCommunity — one poll of /api/community per mounted dashboard, shared
 * by the feed cards ("Discuss · n online") and the mobile Community card.
 * Interval mirrors the route's s-maxage (5 min). A 503 (widget off,
 * upstream down) surfaces as `error` with the last good `data` retained,
 * which the consumers render as "count unavailable" — never as zero.
 */

import { usePolledEndpoint, type PolledState } from "@/lib/hooks/use-polled-endpoint";
import type { CommunityDto } from "@/lib/community/discord-widget";

export const COMMUNITY_POLL_MS = 300_000;

export type CommunityState = PolledState<CommunityDto>;

export function useCommunity(): CommunityState {
  return usePolledEndpoint<CommunityDto>("/api/community", COMMUNITY_POLL_MS);
}
