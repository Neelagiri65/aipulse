/**
 * Marker colours per theme.
 *
 * On the map, colour carries a *category* (which kind of public event landed here), not a state —
 * state is still shape and words everywhere else (PRD web-restyle-v2 §7). A category encoding
 * needs the same hue to survive both grounds, so each kind has a dark-ground value (the original
 * 400-level set, tuned for the dark basemap) and a light-ground value at 600/700 level, which
 * clears 3:1 against the positron basemap. Same hue, same meaning, readable on both.
 */
import type { Theme } from "@/lib/hooks/use-theme";
import { EVENT_TYPE_COLOR } from "@/components/globe/event-detail";

const SLATE_DARK = "#cbd5e1";
const SLATE_LIGHT = "#64748b";

/** Light-ground values, keyed identically to EVENT_TYPE_COLOR. */
export const EVENT_TYPE_COLOR_LIGHT: Record<string, string> = {
  PushEvent: "#0d9488", // teal 600
  PullRequestEvent: "#2563eb", // blue 600
  PullRequestReviewEvent: "#2563eb",
  IssuesEvent: "#7c3aed", // violet 600
  IssueCommentEvent: "#7c3aed",
  ReleaseEvent: "#b45309", // amber 700
  ForkEvent: "#16a34a", // green 600
  WatchEvent: "#a16207", // yellow 700
  CreateEvent: SLATE_LIGHT,
};

export const LAYER_COLOR: Record<Theme, { labs: string; rss: string; registry: string; hn: string }> = {
  dark: { labs: "#a855f7", rss: "#f97316", registry: SLATE_DARK, hn: "#ff6600" },
  // HN orange is a brand mark and holds on both grounds (§7 exception).
  light: { labs: "#7e22ce", rss: "#c2410c", registry: SLATE_LIGHT, hn: "#ff6600" },
};

/** The marker colour for an event type on the given ground. */
export function colorForTypeIn(theme: Theme, type?: string): string {
  if (theme === "light") {
    if (!type) return SLATE_LIGHT;
    return EVENT_TYPE_COLOR_LIGHT[type] ?? SLATE_LIGHT;
  }
  if (!type) return SLATE_DARK;
  return EVENT_TYPE_COLOR[type] ?? SLATE_DARK;
}

/** The six legend swatches, in legend order, for the given ground. */
export function legendColors(theme: Theme): Record<"push" | "pr" | "issue" | "release" | "fork" | "watch", string> {
  return {
    push: colorForTypeIn(theme, "PushEvent"),
    pr: colorForTypeIn(theme, "PullRequestEvent"),
    issue: colorForTypeIn(theme, "IssuesEvent"),
    release: colorForTypeIn(theme, "ReleaseEvent"),
    fork: colorForTypeIn(theme, "ForkEvent"),
    watch: colorForTypeIn(theme, "WatchEvent"),
  };
}

/**
 * The cluster badge's own surface. On the dark ground the pill is a dark disc with a glowing
 * category-coloured rim; on positron that inverts — a near-white disc, ink numerals (a 600-level
 * hue would not clear 4.5:1 as 11px text), the category colour still carried by the rim, and the
 * glow cut right back because a coloured halo on light paper reads as a smudge.
 */
export function clusterSkin(theme: Theme): {
  fill: string;
  text: string;
  glowScale: number;
  borderBoost: number;
} {
  return theme === "light"
    ? { fill: "rgba(255,255,255,0.94)", text: "#16160F", glowScale: 0.35, borderBoost: 1.15 }
    : { fill: "rgba(8,14,20,0.88)", text: "", glowScale: 1, borderBoost: 1 };
}
