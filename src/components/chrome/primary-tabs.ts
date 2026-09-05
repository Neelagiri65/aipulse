/**
 * Gawk — the five primary surfaces (web v2, PRD web-restyle-v2 §1 / §9).
 *
 * One list for desktop TopBar and the mobile bottom bar so both shells share ids, order and
 * labels, and `?tab=` deep links work on either. Flow: Glance (Health) → Drill (Feed, Map,
 * Rooms) → Act (More holds the index and the account-ish rows).
 *
 * The fifth label is "Community" with the Discord mark (founder, 2026-09-05 S109; "Rooms" was the
 * canvas working title). The mark is currentColor, never the accent.
 *
 * Feed carries a second axis, `?view=stories|wire`: Stories is the news/research feed, Wire is the
 * chronological GitHub-events + HN wire (WirePage) that had lost its desktop entry point in phase 2.
 */

export type PrimaryTab = "health" | "feed" | "map" | "rooms" | "more";

export const ROOMS_LABEL = "Community";

export type TabMark = "discord";

export const PRIMARY_TABS: ReadonlyArray<{ id: PrimaryTab; label: string; mark?: TabMark }> = [
  { id: "health", label: "Health" },
  { id: "feed", label: "Feed" },
  { id: "map", label: "Map" },
  { id: "rooms", label: ROOMS_LABEL, mark: "discord" },
  { id: "more", label: "More" },
];

export const DEFAULT_TAB: PrimaryTab = "health";

export const TAB_PARAM = "tab";

export function isPrimaryTab(v: unknown): v is PrimaryTab {
  return PRIMARY_TABS.some((t) => t.id === v);
}

/** Reads `?tab=` from a search string; anything unknown falls back to the default. */
export function tabFromSearch(search: string): PrimaryTab {
  const v = new URLSearchParams(search).get(TAB_PARAM);
  return isPrimaryTab(v) ? v : DEFAULT_TAB;
}

/** Writes `?tab=` without a navigation; the default tab keeps the URL clean. */
export function writeTabToUrl(tab: PrimaryTab) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (tab === DEFAULT_TAB) url.searchParams.delete(TAB_PARAM);
  else url.searchParams.set(TAB_PARAM, tab);
  window.history.replaceState(window.history.state, "", url);
}

/* ---- Feed view axis -------------------------------------------------------------------- */

export type FeedViewMode = "stories" | "wire";

export const DEFAULT_FEED_VIEW: FeedViewMode = "stories";

export const FEED_VIEW_PARAM = "view";

export function isFeedViewMode(v: unknown): v is FeedViewMode {
  return v === "stories" || v === "wire";
}

/** Reads `?view=` from a search string; anything unknown falls back to Stories. */
export function feedViewFromSearch(search: string): FeedViewMode {
  const v = new URLSearchParams(search).get(FEED_VIEW_PARAM);
  return isFeedViewMode(v) ? v : DEFAULT_FEED_VIEW;
}

/** Writes `?view=` without a navigation; the default keeps the URL clean. */
export function writeFeedViewToUrl(mode: FeedViewMode) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (mode === DEFAULT_FEED_VIEW) url.searchParams.delete(FEED_VIEW_PARAM);
  else url.searchParams.set(FEED_VIEW_PARAM, mode);
  window.history.replaceState(window.history.state, "", url);
}
