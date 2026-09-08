"use client";

import { useSyncExternalStore } from "react";

/**
 * The theme actually in force, resolved the way the stylesheet resolves it.
 *
 * `data-theme` on <html> is an explicit choice (the boot script in app/layout.tsx sets it from
 * localStorage before first paint). With no attribute the CSS falls through to
 * `prefers-color-scheme`, so anything that has to match the page — the map's basemap, a canvas
 * palette — must resolve the same way rather than assuming light.
 */
export type Theme = "light" | "dark";

export function resolveTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Fires on an explicit switch (attribute) and on an OS-level change (media query). */
export function subscribeTheme(onChange: () => void): () => void {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener?.("change", onChange);
  return () => {
    obs.disconnect();
    mq?.removeEventListener?.("change", onChange);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, resolveTheme, () => "light");
}
