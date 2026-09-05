"use client";

/**
 * Gawk — Mobile bottom navigation bar (web v2).
 *
 * The five primary surfaces from primary-tabs.ts: Health (default) · Feed · Map · Rooms · More.
 * Health as the landing supersedes the S40 ruling that made the feed the mobile default; the
 * approved web v2 canvas (PRD web-restyle-v2 §1, §10) puts the answer line first on every width.
 * "More" holds the former PANELS strip (Wire / Models / More accordion).
 */

import { track } from "@/lib/analytics";
import { PRIMARY_TABS, type PrimaryTab } from "@/components/chrome/primary-tabs";

/** @deprecated web v2: alias of PrimaryTab, kept for the transition. */
export type MobileTopLevelTab = PrimaryTab;

const TABS = PRIMARY_TABS;

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
