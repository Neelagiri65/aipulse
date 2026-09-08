"use client";

import { deriveHealthTiles, type HealthTilesInput } from "@/lib/health/tiles";
import { stampUtc } from "@/lib/format/utc-stamp";
import { boardHref, type BoardId } from "@/components/chrome/primary-tabs";

/**
 * Four compact tiles under the world band on Health (canvas Health board, PRD §7): a number, what
 * it counts, its source and the time the source was read. Numbers are ink; a pending tile is "—"
 * in muted italic with its source line and no time — never a 0 before the source answers.
 */
export function HealthTiles({ onOpenBoard, ...input }: HealthTilesInput & { onOpenBoard?: (id: BoardId) => void }) {
  const tiles = deriveHealthTiles(input);
  return (
    <div className="ap-healthtiles" data-testid="health-tiles" aria-label="Health tiles">
      {tiles.map((t) => (
        <div key={t.id} className="ap-tile ap-htile" data-tile={t.id} data-pending={t.pending ? "1" : undefined}>
          <div>
            <div className={`ap-htile__num${t.pending ? " ap-tile__value--pending" : ""}`}>{t.value}</div>
            <div className="ap-htile__label">{t.label}</div>
          </div>
          <div className="ap-htile__src">
            <a href={t.sourceUrl} target={t.sourceUrl.startsWith("/") ? undefined : "_blank"} rel={t.sourceUrl.startsWith("/") ? undefined : "noopener noreferrer"}>
              {t.source}
            </a>
            <span>{t.at ? stampUtc(t.at) : "waiting for the first read"}</span>
            {t.boardId ? (
              <a
                className="ap-htile__drill"
                href={boardHref(t.boardId)}
                onClick={(e) => {
                  if (!onOpenBoard) return;
                  e.preventDefault();
                  onOpenBoard(t.boardId as BoardId);
                }}
              >
                Open the board ›
              </a>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
