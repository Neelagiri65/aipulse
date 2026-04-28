"use client";

/**
 * Gawk — Mobile bottom navigation bar.
 *
 * Three top-level tabs: FEED (default) | MAP | PANELS. The PANELS
 * tab opens the existing 4-tab strip (Wire / Health / Models / More)
 * — which used to be the top-level mobile nav before the feed
 * pivot. FEED is the new default mobile landing per S40 PRD.
 */

import { track } from "@/lib/analytics";

export type MobileTopLevelTab = "feed" | "map" | "panels";

const TABS: Array<{ id: MobileTopLevelTab; label: string }> = [
  { id: "feed", label: "FEED" },
  { id: "map", label: "MAP" },
  { id: "panels", label: "PANELS" },
];

export type MobileBottomBarProps = {
  active: MobileTopLevelTab;
  onSelect: (tab: MobileTopLevelTab) => void;
};

export function MobileBottomBar({ active, onSelect }: MobileBottomBarProps) {
  return (
    <nav
      className="ap-mobile-bottombar"
      role="tablist"
      aria-label="Mobile primary navigation"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`ap-mobile-bottombar__item${
            active === t.id ? " is-active" : ""
          }`}
          data-tab={t.id}
          onClick={() => {
            onSelect(t.id);
            track("panel_open", { panel: `top:${t.id}`, surface: "mobile" });
          }}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
