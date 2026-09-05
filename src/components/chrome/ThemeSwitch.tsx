"use client";

/**
 * Gawk — light / dark switch (web v2, PRD web-restyle-v2 §6: light default with a switch).
 *
 * Source of truth is the `data-theme` attribute on <html>, which the inline boot script in
 * `app/layout.tsx` sets before first paint from `localStorage["gawk-theme"]`. This component
 * reads that attribute after mount (never a default, so the label cannot flip on hydration),
 * and on click writes both the attribute and the stored choice. No OS media query: the
 * founder's ruling is light unless the reader chooses otherwise.
 */

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "gawk-theme";
export type Theme = "light" | "dark";

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Every switch on the page follows the attribute, so two switches (top bar, mobile bar) never disagree. */
function subscribeTheme(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode, blocked site data); the attribute still applies.
  }
}

export function ThemeSwitch({ className = "" }: { className?: string }) {
  // Server snapshot is `null`: the server render carries no label text that could disagree
  // with the attribute the boot script has already set; the client snapshot is the attribute.
  const theme = useSyncExternalStore<Theme | null>(subscribeTheme, readTheme, () => null);

  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = theme === null ? "" : theme === "dark" ? "Light" : "Dark";

  return (
    <button
      type="button"
      className={`ap-theme-switch ${className}`}
      onClick={() => applyTheme(next)}
      aria-label={theme === null ? "Switch theme" : `Switch to ${next} theme`}
      data-theme-switch
      data-theme-current={theme ?? undefined}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      <span className="ap-theme-switch__label" data-theme-label>
        {label}
      </span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
