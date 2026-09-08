"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type MouseEvent } from "react";
import type { GlobeEventsResult } from "@/lib/data/fetch-events";
import type { GlobePoint } from "@/components/globe/Globe";
import { shortEventType } from "@/components/globe/event-types";
import { actorHref, actorLabel, repoHref, repoLabel } from "@/lib/data/event-links";
import {
  cellMark,
  groupByCell,
  gridWithCols,
  isLand,
  neighbourhood,
  regionSummary,
  type WorldGrid,
} from "@/lib/world-grid";

type WorldBandProps = {
  events: GlobeEventsResult | undefined;
  /** true until the first /api/globe-events poll answers */
  loading: boolean;
  /** latest poll error; `events` may still hold the last good poll */
  error?: string;
  /** 90 = desktop column, 60 = phone */
  cols?: 90 | 60;
  onOpenMap: () => void;
};

/** viewBox units per cell; the SVG scales to the column width */
const PITCH = 8;
const R_SOLID = (PITCH * 0.36).toFixed(2);
const R_HOLLOW = (PITCH * 0.26).toFixed(2);
const LAND_MASK_SAMPLED = "2026-09-05";
/** the lens covers (2r+1)² cells around the pointer */
const LENS_RADIUS = 2;
const LENS_PITCH = 14;
const LENS_W = 268;
const DETAIL_CAP = 40;
/** touch: the lens opens after the finger has rested this long; a shorter touch is a tap */
const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 8;

function hhmmUtc(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function ago(iso: unknown, now: number): string {
  if (typeof iso !== "string") return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 === 0 ? `${h}h ago` : `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const plural = (n: number, word: string) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

type ByCell = Map<number, GlobePoint[]>;

function pointsAround(grid: WorldGrid, byCell: ByCell, cell: number): GlobePoint[] {
  const out: GlobePoint[] = [];
  for (const c of neighbourhood(grid, cell, LENS_RADIUS)) {
    const list = byCell.get(c);
    if (list) out.push(...list);
  }
  return out;
}

function whereLabel(grid: WorldGrid, cell: number, countries: Array<[string, number]>): string {
  if (countries.length === 1) return countries[0][0];
  if (countries.length > 1) return countries.slice(0, 3).map(([c, n]) => `${c} ${n}`).join(" · ");
  return isLand(grid, cell) ? "Land · nothing recorded here" : "Sea";
}

/** The lens: a magnified 5×5 neighbourhood and what the points in it say. Pure of the pointer. */
function Lens({
  grid,
  byCell,
  cell,
  x,
  y,
  stageW,
  touch,
}: {
  grid: WorldGrid;
  byCell: ByCell;
  cell: number;
  x: number;
  y: number;
  stageW: number;
  /** opened by a long-press: the hints say tap, and a tap can close it */
  touch: boolean;
}) {
  const cells = neighbourhood(grid, cell, LENS_RADIUS);
  const s = regionSummary(pointsAround(grid, byCell, cell));
  const cx0 = (cell % grid.cols) - LENS_RADIUS;
  const ry0 = Math.floor(cell / grid.cols) - LENS_RADIUS;
  const size = (2 * LENS_RADIUS + 1) * LENS_PITCH;
  const counts = new Map<number, number>();
  for (const c of cells) counts.set(c, byCell.get(c)?.length ?? 0);
  const left = Math.max(4, Math.min(x - LENS_W / 2, stageW - LENS_W - 4));
  const below = y < 170;
  const line = s.count
    ? `${plural(s.count, "event")} · ${s.aiConfig.toLocaleString("en-GB")} on repos with AI config · ` +
      s.types.slice(0, 3).map(([t, n]) => `${shortEventType(t).toLowerCase()} ${n}`).join(" · ")
    : "No located event in these cells in the window";
  return (
    <div
      className="ap-lens"
      data-testid="world-lens"
      style={{ left, top: below ? y + 18 : y - 14, transform: below ? undefined : "translateY(-100%)" }}
      role="status"
    >
      <svg className="ap-lens__grid" viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        {cells.map((c) => {
          const gx = (c % grid.cols) - cx0;
          const gy = Math.floor(c / grid.cols) - ry0;
          const px = gx * LENS_PITCH + LENS_PITCH / 2;
          const py = gy * LENS_PITCH + LENS_PITCH / 2;
          const mark = cellMark(grid, counts, c);
          if (mark === "none") return null;
          return mark === "solid" ? (
            <circle key={c} cx={px} cy={py} r={LENS_PITCH * 0.36} className="ap-worldband__solid" />
          ) : (
            <circle key={c} cx={px} cy={py} r={LENS_PITCH * 0.26} className="ap-worldband__hollow" />
          );
        })}
        <rect
          x={LENS_RADIUS * LENS_PITCH + 0.5}
          y={LENS_RADIUS * LENS_PITCH + 0.5}
          width={LENS_PITCH - 1}
          height={LENS_PITCH - 1}
          className="ap-lens__focus"
        />
      </svg>
      <div className="ap-lens__text">
        <div className="ap-lens__where">{whereLabel(grid, cell, s.countries)}</div>
        <div className="ap-lens__line">{line}</div>
        {s.count > 0 ? (
          <div className="ap-lens__hint">{touch ? "tap for the events" : "click for the events"}</div>
        ) : touch ? (
          <div className="ap-lens__hint">tap to close</div>
        ) : null}
      </div>
    </div>
  );
}

/** The drilldown: every located event around the chosen cell, newest first, each with its durable link. */
export function RegionDetail({
  grid,
  byCell,
  cell,
  now,
  onClose,
}: {
  grid: WorldGrid;
  byCell: ByCell;
  cell: number;
  now: number;
  onClose: () => void;
}) {
  const pts = pointsAround(grid, byCell, cell)
    .slice()
    .sort((a, b) => String(b.meta?.createdAt ?? "").localeCompare(String(a.meta?.createdAt ?? "")));
  const s = regionSummary(pts);
  const shown = pts.slice(0, DETAIL_CAP);
  const where = whereLabel(grid, cell, s.countries);
  return (
    <section className="ap-region" data-testid="world-region" aria-label={`Events around ${where}`}>
      <div className="ap-region__head">
        <div>
          <div className="ap-region__title">Events around {where}</div>
          <div className="ap-region__sub">
            {plural(s.count, "located event")} in the window · {s.aiConfig.toLocaleString("en-GB")} on repos with AI
            config · {plural(s.repos.length, "repo")} · newest first
            {pts.length > DETAIL_CAP ? ` · showing ${DETAIL_CAP}` : ""}
          </div>
        </div>
        <button type="button" className="ap-btn-ghost ap-region__close" onClick={onClose}>
          Close
        </button>
      </div>
      <ul className="ap-region__list">
        {shown.map((p, i) => {
          const m = p.meta ?? {};
          const repo = str(m.repo);
          const href = repoHref(repo);
          const type = str(m.type) ?? "";
          const country = str(m.country);
          const region = str(m.region);
          const source = m.sourceKind === "gitlab" ? "GitLab" : "GitHub";
          const aHref = actorHref(str(m.actor));
          return (
            <li key={str(m.eventId) ?? i} className="ap-region__row">
              <span className="ap-trow__kicker">
                {shortEventType(type)} · {m.hasAiConfig === true ? "ai-cfg" : "no-cfg"}
              </span>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="ap-region__repo">
                  {repoLabel(repo)}
                </a>
              ) : (
                <span className="ap-region__repo">{repoLabel(repo)}</span>
              )}
              <span className="ap-region__cap">
                {aHref ? (
                  <a href={aHref} target="_blank" rel="noopener noreferrer">
                    {actorLabel(str(m.actor))}
                  </a>
                ) : (
                  actorLabel(str(m.actor))
                )}
                {" · "}
                {ago(m.createdAt, now)}
                {country ? ` · ${country}${region ? `, ${region}` : ""}` : ""}
                {" · "}
                {source} public events
              </span>
            </li>
          );
        })}
      </ul>
      {pts.length > DETAIL_CAP ? (
        <p className="ap-region__more">
          {(pts.length - DETAIL_CAP).toLocaleString("en-GB")} more in this window are on the full map.
        </p>
      ) : null}
    </section>
  );
}

/**
 * The world in the system's own marks: solid = a located public event landed in this cell during
 * the rolling window, hollow = land with nothing recorded, blank = sea. No incident marks here —
 * incidents stay on the tool rows with their status-page source. A pointer or a touch over the band
 * opens a lens on the region under it; a click opens that region's events.
 */
export const WorldBand = memo(function WorldBand({
  events,
  loading,
  error,
  cols = 90,
  onOpenMap,
}: WorldBandProps) {
  const grid = gridWithCols(cols);
  const points = events?.points;
  const byCell = useMemo<ByCell>(() => groupByCell(grid, points ?? []), [grid, points]);
  const placed = useMemo(() => [...byCell.values()].reduce((n, l) => n + l.length, 0), [byCell]);

  const cells = useMemo(() => {
    const out: React.ReactNode[] = [];
    const counts = new Map<number, number>();
    for (const [c, l] of byCell) counts.set(c, l.length);
    for (let ry = 0; ry < grid.rows; ry++) {
      for (let cx = 0; cx < grid.cols; cx++) {
        const c = ry * grid.cols + cx;
        const mark = cellMark(grid, counts, c);
        if (mark === "none") continue;
        const x = cx * PITCH + PITCH / 2;
        const y = ry * PITCH + PITCH / 2;
        out.push(
          mark === "solid" ? (
            <circle key={c} cx={x} cy={y} r={R_SOLID} className="ap-worldband__solid" />
          ) : (
            <circle key={c} cx={x} cy={y} r={R_HOLLOW} className="ap-worldband__hollow" />
          ),
        );
      }
    }
    return out;
  }, [grid, byCell]);

  // ---- lens + drilldown state ----
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ cell: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [stageW, setStageW] = useState(0);
  // "now" for the drilldown's relative times is taken when the region is opened (never in render).
  const [openedAt, setOpenedAt] = useState(0);
  const open = useCallback((cell: number) => {
    setOpenedAt(Date.now());
    setSelected(cell);
  }, []);

  const locate = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      const stage = stageRef.current;
      if (!svg || !stage) return null;
      const r = svg.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      const cx = Math.floor(((clientX - r.left) / r.width) * grid.cols);
      const ry = Math.floor(((clientY - r.top) / r.height) * grid.rows);
      if (cx < 0 || cx >= grid.cols || ry < 0 || ry >= grid.rows) return null;
      setStageW(sr.width);
      return { cell: ry * grid.cols + cx, x: clientX - sr.left, y: clientY - sr.top };
    },
    [grid],
  );

  const cellPosition = useCallback(
    (cell: number) => {
      const svg = svgRef.current;
      const stage = stageRef.current;
      if (!svg || !stage) return { x: 0, y: 0 };
      const r = svg.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      const cx = cell % grid.cols;
      const ry = Math.floor(cell / grid.cols);
      setStageW(sr.width);
      return {
        x: r.left - sr.left + ((cx + 0.5) / grid.cols) * r.width,
        y: r.top - sr.top + ((ry + 0.5) / grid.rows) * r.height,
      };
    },
    [grid],
  );

  // ---- touch: long-press opens the lens, a tap then opens the events (or closes the lens) ----
  const [touchLens, setTouchLens] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const lastPointerType = useRef<string>("mouse");
  const clearPress = useCallback(() => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);
  useEffect(() => clearPress, [clearPress]);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    lastPointerType.current = e.pointerType;
    if (e.pointerType !== "touch") {
      setHover(locate(e.clientX, e.clientY));
      return;
    }
    clearPress();
    longPressed.current = false;
    pressAt.current = { x: e.clientX, y: e.clientY };
    const { clientX, clientY } = e;
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      const at = locate(clientX, clientY);
      if (!at) return;
      longPressed.current = true;
      setHover(at);
      setTouchLens(true);
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "touch") {
      setHover(locate(e.clientX, e.clientY));
      return;
    }
    if (pressTimer.current !== null && pressAt.current) {
      const moved = Math.hypot(e.clientX - pressAt.current.x, e.clientY - pressAt.current.y);
      if (moved > LONG_PRESS_SLOP_PX) clearPress(); // it is a scroll or a drag, not a press
      return;
    }
    // a pinned lens follows the finger
    if (touchLens && longPressed.current) {
      const at = locate(e.clientX, e.clientY);
      if (at) setHover(at);
    }
  };
  const onPointerEnd = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") clearPress();
  };
  const onPointerLeave = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") {
      clearPress();
      return; // the pinned lens stays until a tap
    }
    setHover(null);
  };
  const closeTouchLens = () => {
    setTouchLens(false);
    setHover(null);
  };
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    if (lastPointerType.current === "touch") {
      if (longPressed.current) {
        // the click that follows a long-press release is not a tap
        longPressed.current = false;
        return;
      }
      if (!touchLens || !hover) return; // a plain tap without a lens does nothing
      if (pointsAround(grid, byCell, hover.cell).length > 0) open(hover.cell);
      closeTouchLens();
      return;
    }
    const at = locate(e.clientX, e.clientY);
    if (!at) return;
    if (pointsAround(grid, byCell, at.cell).length > 0) open(at.cell);
  };
  const onContextMenu = (e: MouseEvent<SVGSVGElement>) => {
    if (lastPointerType.current === "touch") e.preventDefault(); // long-press must not open the browser menu
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (e.key in step) {
      e.preventDefault();
      const cur = hover?.cell ?? Math.floor(grid.rows / 2) * grid.cols + Math.floor(grid.cols / 2);
      const [dx, dy] = step[e.key];
      const cx = Math.max(0, Math.min(grid.cols - 1, (cur % grid.cols) + dx));
      const ry = Math.max(0, Math.min(grid.rows - 1, Math.floor(cur / grid.cols) + dy));
      const cell = ry * grid.cols + cx;
      setHover({ cell, ...cellPosition(cell) });
    } else if ((e.key === "Enter" || e.key === " ") && hover) {
      e.preventDefault();
      if (pointsAround(grid, byCell, hover.cell).length > 0) open(hover.cell);
    } else if (e.key === "Escape") {
      closeTouchLens();
      setSelected(null);
    }
  };

  const polled = hhmmUtc(events?.polledAt);
  const windowMin = events?.coverage.windowMinutes ?? 240;
  const hours = windowMin / 60;
  const degraded: string[] = [];
  if (events) {
    const cov = events.coverage;
    if (cov.eventsReceived === 0) degraded.push("no events received in the window");
    else if (cov.eventsWithLocation === 0) degraded.push("no received event had a known location");
    if (events.source === "inprocess-fallback") {
      degraded.push("event store unavailable — in-process poll, nothing retained between polls");
    }
  }
  const state: "pending" | "unavailable" | "stale" | "degraded" | "live" = !events
    ? loading || !error
      ? "pending"
      : "unavailable"
    : error
      ? "stale"
      : degraded.length > 0
        ? "degraded"
        : "live";

  let caption: string;
  if (state === "pending") {
    caption = "Waiting for the first events poll — nothing recorded yet.";
  } else if (state === "unavailable") {
    caption = `Events source unavailable (${error}) — nothing to show.`;
  } else {
    const cov = events!.coverage;
    const outside = (points?.length ?? 0) - placed;
    caption =
      `${placed.toLocaleString("en-GB")} located public events in the rolling ${windowMin}-min window` +
      ` · ${cov.windowAiConfig.toLocaleString("en-GB")} on repos with AI config` +
      ` · a location was known for ${cov.locationCoveragePct}% of events received` +
      (outside > 0 ? ` · ${outside} outside the band's 74°N–56°S span` : "") +
      (degraded.length > 0 ? ` · ${degraded.join(" · ")}` : "") +
      (state === "stale" ? ` · last good poll ${polled ?? "unknown"}; the latest poll failed (${error})` : "");
  }

  const hoverPos = hover ? { cx: (hover.cell % grid.cols) * PITCH + PITCH / 2, cy: Math.floor(hover.cell / grid.cols) * PITCH + PITCH / 2 } : null;

  return (
    <div className="ap-inset ap-worldband" data-testid="world-band" data-state={state}>
      <div className="ap-inset__head ap-inset__head--split">
        <span>Where events landed · last {hours}h</span>
        <span>GitHub + GitLab public events{polled && state !== "stale" ? ` · polled ${polled}` : ""}</span>
      </div>
      <div className="ap-worldband__stage" ref={stageRef}>
        <svg
          ref={svgRef}
          className="ap-worldband__svg"
          viewBox={`0 0 ${grid.cols * PITCH} ${grid.rows * PITCH}`}
          role="img"
          aria-label={`${caption} Use the arrow keys to move the lens, Enter to open the events under it.`}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onKeyDown={onKeyDown}
        >
          {cells}
          {hoverPos ? (
            <rect
              x={hoverPos.cx - PITCH / 2}
              y={hoverPos.cy - PITCH / 2}
              width={PITCH}
              height={PITCH}
              className="ap-worldband__focus"
            />
          ) : null}
        </svg>
        {hover ? (
          <Lens grid={grid} byCell={byCell} cell={hover.cell} x={hover.x} y={hover.y} stageW={stageW} touch={touchLens} />
        ) : null}
      </div>
      <div className="ap-worldband__foot">
        <p className="ap-worldband__cap">{caption}</p>
        <p className="ap-worldband__legend">
          solid = an event landed here · hollow = land, nothing recorded · point at a cell (press and hold
          on touch) for its region, click or tap for the events ·{" "}
          <button type="button" className="ap-link-btn" onClick={onOpenMap}>
            Open the full map
          </button>
        </p>
        <p className="ap-worldband__attr">
          Land mask © OpenStreetMap contributors (ODbL), OpenFreeMap positron via OpenMapTiles, sampled{" "}
          {LAND_MASK_SAMPLED}. A cell is solid only when a located event&apos;s coordinates fall inside it.
        </p>
      </div>
      {selected !== null ? (
        <RegionDetail grid={grid} byCell={byCell} cell={selected} now={openedAt} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
});
