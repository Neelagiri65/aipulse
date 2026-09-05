/**
 * Gawk — the five primary surfaces (web v2, PRD web-restyle-v2 §1 / §9).
 *
 * One list for desktop TopBar and the mobile bottom bar so both shells share ids, order and
 * labels, and `?tab=` deep links work on either. Flow: Glance (Health) → Drill (Feed, Map,
 * Rooms) → Act (More holds the index and the account-ish rows).
 *
 * The fifth label is the founder's open call ("Rooms" as approved on the canvas, or
 * "Community"): change ROOMS_LABEL and nothing else.
 */

export type PrimaryTab = "health" | "feed" | "map" | "rooms" | "more";

export const ROOMS_LABEL = "Rooms";

export const PRIMARY_TABS: ReadonlyArray<{ id: PrimaryTab; label: string }> = [
  { id: "health", label: "Health" },
  { id: "feed", label: "Feed" },
  { id: "map", label: "Map" },
  { id: "rooms", label: ROOMS_LABEL },
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
