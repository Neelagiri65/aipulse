"use client";

import { useSyncExternalStore } from "react";

/**
 * The theme actually in force, resolved the way the stylesheet resolves it.
 *
 * `globals.css` defines the light set on `:root` and the dark set on `[data-theme="dark"]` only —
 * there is no `prefers-color-scheme` block, because the founder's ruling (PRD web-restyle-v2 §6,
 * restated in `chrome/ThemeSwitch.tsx`) is light unless the reader chooses otherwise. The boot
 * script in `app/layout.tsx` sets the attribute from `localStorage["gawk-theme"]` before first
 * paint. So anything that has to match the page — the map's basemap, a canvas palette — resolves
 * the attribute and nothing else. Reading the OS preference here made the basemap dark under
 * light chrome for every OS-dark visitor with no stored choice (seen on prod after #111).
 */
export type Theme = "light" | "dark";

export function resolveTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Fires on an explicit switch, which is the only thing that changes the theme. */
export function subscribeTheme(onChange: () => void): () => void {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, resolveTheme, () => "light");
}
