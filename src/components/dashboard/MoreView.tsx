"use client";

/**
 * gawk.dev — More: the index. Boards open as reading surfaces under More (`?tab=more&board=`);
 * every row is a real link so it works before hydration and as a deep link, and the click is
 * intercepted for an in-place open once React is up. The Wire is Feed's second view, so its row
 * goes there. Then the "about the numbers" rows.
 */

import Link from "next/link";
import type { NavItem } from "@/components/chrome/nav-items";
import { boardHref, isBoardId, type BoardId } from "@/components/chrome/primary-tabs";

export type MoreViewProps = {
  items: NavItem[];
  currentBoard: BoardId | null;
  onOpenBoard: (id: BoardId) => void;
  onOpenWire: () => void;
};

export const WIRE_HREF = "/?tab=feed&view=wire";

const ABOUT_ROWS: ReadonlyArray<{ href: string; label: string; sub: string }> = [
  { href: "/sources", label: "Sources", sub: "every source with endpoint, cadence and sanity range" },
  { href: "/methodology", label: "Methodology", sub: "how each number is made · what it does not mean" },
  { href: "/audit", label: "Audit", sub: "CLAUDE.md checker · deterministic pattern matching · no LLM by default" },
  { href: "/newsletter", label: "Daily email", sub: "the digest, 08:00 UTC" },
  { href: "/privacy", label: "Privacy", sub: "no data sold · no ad network" },
];

export function MoreView({ items, currentBoard, onOpenBoard, onOpenWire }: MoreViewProps) {
  return (
    <section className="ap-column" aria-label="More">
      <div className="ap-inset">
        <div className="ap-inset__head">Boards</div>
        {items.map((it) => {
          const meta = it.soon ? "soon" : it.count != null ? it.count.toLocaleString("en-GB") : "";
          if (it.soon) {
            return (
              <span
                key={it.id}
                className="ap-list-row ap-list-row--soon"
                data-board-row={it.id}
                aria-disabled="true"
                title={`${it.label} · coming soon`}
              >
                <span className="ap-list-row__main">{it.label}</span>
                <span className="ap-list-row__meta">{meta}</span>
              </span>
            );
          }
          if (it.id === "wire") {
            return (
              <Link
                key={it.id}
                href={WIRE_HREF}
                className="ap-list-row"
                data-board-row="wire"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenWire();
                }}
              >
                <span className="ap-list-row__main">{it.label}</span>
                <span className="ap-list-row__meta">{meta}</span>
              </Link>
            );
          }
          if (!isBoardId(it.id)) return null;
          const id = it.id;
          return (
            <Link
              key={id}
              href={boardHref(id)}
              className={`ap-list-row${currentBoard === id ? " ap-list-row--on" : ""}`}
              data-board-row={id}
              aria-current={currentBoard === id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                onOpenBoard(id);
              }}
            >
              <span className="ap-list-row__main">{it.label}</span>
              <span className="ap-list-row__meta">{meta}</span>
            </Link>
          );
        })}
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
