"use client";

/**
 * Gawk — More: the index. Boards (the existing panels, opened as the floating windows they
 * already are on desktop) and the "about the numbers" rows. Phase 2 of the web restyle wires
 * the surface; phase 3 restyles the panels themselves.
 */

import Link from "next/link";
import type { NavItem } from "@/components/chrome/LeftNav";

export type MoreViewProps = {
  items: NavItem[];
  openIds: Set<string>;
  onToggle: (id: string) => void;
};

const ABOUT_ROWS: ReadonlyArray<{ href: string; label: string; sub: string }> = [
  { href: "/sources", label: "Sources", sub: "every source with endpoint, cadence and sanity range" },
  { href: "/methodology", label: "Methodology", sub: "how each number is made · what it does not mean" },
  { href: "/audit", label: "Audit", sub: "CLAUDE.md checker · deterministic pattern matching · no LLM by default" },
  { href: "/newsletter", label: "Daily email", sub: "the digest, 08:00 UTC" },
  { href: "/privacy", label: "Privacy", sub: "no data sold · no ad network" },
];

export function MoreView({ items, openIds, onToggle }: MoreViewProps) {
  return (
    <section className="ap-column" aria-label="More">
      <div className="ap-inset">
        <div className="ap-inset__head">Boards</div>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`ap-list-row${openIds.has(it.id) ? " ap-list-row--on" : ""}`}
            onClick={() => onToggle(it.id)}
            disabled={it.soon}
            title={it.soon ? `${it.label} · coming soon` : it.label}
          >
            <span className="ap-list-row__main">{it.label}</span>
            <span className="ap-list-row__meta">
              {it.soon ? "soon" : it.count != null ? it.count : ""}
            </span>
          </button>
        ))}
      </div>
      <div className="ap-inset">
        <div className="ap-inset__head">About the numbers</div>
        {ABOUT_ROWS.map((r) => (
          <Link key={r.href} href={r.href} className="ap-list-row">
            <span className="ap-list-row__main">{r.label}</span>
            <span className="ap-list-row__meta">{r.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
