"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { boardHref, BOARD_TITLE, type BoardId } from "@/components/chrome/primary-tabs";

/**
 * A board as a reading surface under More (canvas Flow board: Glance → Drill → Act; "Boards are
 * not a destination"). One column: the way back, the board's title and count, its stat line and
 * insight when it has them, then the body in an inset. Replaces the floating windows over the
 * Map stage — the board no longer needs the map behind it.
 */
export type BoardViewProps = {
  id: BoardId;
  count?: number;
  statBar?: ReactNode;
  insight?: ReactNode;
  /** A standalone route for the same board, when one exists (SDK adoption, Model usage). */
  fullPageHref?: string;
  onBack: () => void;
  children: ReactNode;
};

export function BoardView({ id, count, statBar, insight, fullPageHref, onBack, children }: BoardViewProps) {
  const { name, qualifier } = BOARD_TITLE[id];
  return (
    <section className="ap-column ap-column--board" aria-label={name} data-testid="board-view" data-board={id}>
      <div className="ap-board__head">
        <Link
          href="/?tab=more"
          className="ap-board__back"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          ‹ More
        </Link>
        <h2 className="ap-board__title">
          {name}
          {qualifier ? <span className="ap-board__qualifier">{` · ${qualifier}`}</span> : null}
        </h2>
        {count != null ? <span className="ap-board__count">{count.toLocaleString("en-GB")}</span> : null}
      </div>
      <div className="ap-inset ap-board">
        {statBar ? <div className="ap-board__stat">{statBar}</div> : null}
        {insight}
        <div className="ap-board__body">{children}</div>
      </div>
      {fullPageHref ? (
        <p className="ap-board__foot">
          <Link href={fullPageHref} className="ap-link-btn">
            Open the full page
          </Link>
          <span> · </span>
          <Link href={boardHref(id)} className="ap-link-btn">
            Link to this board
          </Link>
        </p>
      ) : (
        <p className="ap-board__foot">
          <Link href={boardHref(id)} className="ap-link-btn">
            Link to this board
          </Link>
        </p>
      )}
    </section>
  );
}
