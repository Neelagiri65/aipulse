"use client";

import { useState } from "react";

export type NavItem = {
  id: string;
  label: string;
  icon: NavIconName;
  count?: number | null;
  hot?: boolean;
  /** True when the feature isn't built yet. Renders greyed, no click, "soon" badge. */
  soon?: boolean;
};

export type LeftNavProps = {
  items: NavItem[];
  openIds: Set<string>;
  onToggle: (id: string) => void;
  /** Initial expand state; caller controls via key if they need to force. */
  defaultExpanded?: boolean;
};

/**
 * Left-edge icon rail. Collapsed shows icon-only (44px); expanded shows
 * icon + label + count/soon-badge (176px). Items flagged `soon` are
 * rendered but disabled — signal the roadmap, don't hide it (per brief).
 */
export function LeftNav({
  items,
  openIds,
  onToggle,
  defaultExpanded = true,
}: LeftNavProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <nav
      className={`ap-icon-nav ${expanded ? "ap-icon-nav--expanded" : "ap-icon-nav--collapsed"}`}
      role="navigation"
      aria-label="Panel navigation"
    >
      <button
        type="button"
        className="ap-icon-nav__hamburger"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Collapse nav" : "Expand nav"}
      >
        <HamburgerIcon />
      </button>
      {items.map((n) => {
        const active = openIds.has(n.id);
        return (
          <button
            key={n.id}
            type="button"
            className={`ap-icon-nav__item ${active ? "ap-icon-nav__item--active" : ""}`}
            onClick={() => !n.soon && onToggle(n.id)}
            disabled={n.soon}
            aria-pressed={active}
            aria-disabled={n.soon}
            title={n.soon ? `${n.label} · coming soon` : n.label}
          >
            <NavIcon name={n.icon} />
            {expanded && (
              <>
                <span className="ap-icon-nav__label">{n.label}</span>
                {n.soon ? (
                  <span className="ap-icon-nav__soon">soon</span>
                ) : n.count != null ? (
                  <span
                    className={`ap-icon-nav__count ${n.hot ? "ap-icon-nav__count--hot" : ""}`}
                  >
                    {n.count}
                  </span>
                ) : null}
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}

type NavIconName =
  | "wire"
  | "tools"
  | "models"
  | "agents"
  | "research"
  | "benchmarks"
  | "security"
  | "audit";

function HamburgerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "wire":
      return (
        <svg {...common}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "tools":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "models":
      return (
        <svg {...common}>
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
          <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
        </svg>
      );
    case "agents":
      return (
        <svg {...common}>
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
        </svg>
      );
    case "research":
      return (
        <svg {...common}>
          <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
          <path d="M6.453 15h11.094M8.5 2h7" />
        </svg>
      );
    case "benchmarks":
      return (
        <svg {...common}>
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      );
    case "security":
    case "audit":
      return (
        <svg {...common}>
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
  }
}
