"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Panel-identity accent. Drives the titlebar dot colour and the topmost
 * glow. Identity, not state — a Tools panel with a degraded tool keeps
 * its green accent; state is carried by the per-panel stat bar + global
 * StatusBar. See `docs/design-spec-v2.md` → Principle 1.5.
 */
export type WinAccent = "teal" | "amber" | "green" | "violet" | "orange";

export type WinProps = {
  id: string;
  title: string;
  initial: { x: number; y: number; w: number; h: number };
  zIndex: number;
  minimized?: boolean;
  maximized?: boolean;
  /**
   * True when this panel is the topmost open panel (last in zorder).
   * When false the panel paints the `ap-win--behind` dim treatment so a
   * stack of open panels is visually parseable without closing any.
   */
  topmost?: boolean;
  /** Panel-identity accent (default teal). See `WinAccent`. */
  accent?: WinAccent;
  /**
   * Maximise geometry (FIX-02).
   *
   * - `"default"` (the original) — near-full: `w = innerW - 32`, hugs
   *   the viewport edges. Used by panels with wide tabular content
   *   (benchmarks) where every horizontal pixel pays off.
   * - `"centered"` — 80% viewport width, centred. Used by panels
   *   whose maximised content benefits from breathing room + a visible
   *   map frame (tool-health cards, etc.). Gives the observatory the
   *   "window, not page" feel from design-spec-v2 principle 1.
   */
  maximizedLayout?: "default" | "centered";
  /**
   * Optional master-detail summary row rendered under the titlebar.
   * 10px monospace, divider-dotted. Leave undefined to render no row.
   * Data derivation lives in Dashboard, not here — this slot is pure UI.
   */
  statBar?: React.ReactNode;
  onFocus?: (id: string) => void;
  onClose?: (id: string) => void;
  onMinimize?: (id: string) => void;
  onMaximize?: (id: string) => void;
  children: React.ReactNode;
};

/**
 * Floating draggable / resizable window with the AI Pulse window-chrome look.
 * Headless about content — pass the panel body as children. Pure client state;
 * does not persist position (intentional — panels reset on reload like a HUD).
 */
export function Win({
  id,
  title,
  initial,
  zIndex,
  minimized,
  maximized,
  topmost,
  accent = "teal",
  maximizedLayout = "default",
  statBar,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  children,
}: WinProps) {
  const [pos, setPos] = useState(initial);
  const dragRef = useRef<
    | null
    | {
        mode: "move" | "resize";
        ox: number;
        oy: number;
        sw?: number;
        sh?: number;
      }
  >(null);
  const prevPosRef = useRef<typeof initial | null>(null);

  // Maximize / restore
  useEffect(() => {
    if (maximized) {
      if (!prevPosRef.current) prevPosRef.current = pos;
      const h = Math.max(240, window.innerHeight - 140);
      if (maximizedLayout === "centered") {
        // 80% width, centred horizontally. Floor keeps the panel at least
        // as wide as the default restore so narrow viewports don't shrink
        // past usable content width.
        const w = Math.max(320, Math.floor(window.innerWidth * 0.8));
        const x = Math.max(16, Math.floor((window.innerWidth - w) / 2));
        setPos({ x, y: 60, w, h });
      } else {
        const w = Math.max(320, window.innerWidth - 32);
        setPos({ x: 16, y: 60, w, h });
      }
    } else if (prevPosRef.current) {
      setPos(prevPosRef.current);
      prevPosRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maximized]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.mode === "move") {
        setPos((p) => ({
          ...p,
          x: e.clientX - d.ox,
          y: Math.max(56, e.clientY - d.oy),
        }));
      } else if (d.mode === "resize" && d.sw !== undefined && d.sh !== undefined) {
        const dx = e.clientX - d.ox;
        const dy = e.clientY - d.oy;
        setPos((p) => ({
          ...p,
          w: Math.max(300, d.sw! + dx),
          h: Math.max(140, d.sh! + dy),
        }));
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onTitleDown = (e: React.MouseEvent) => {
    if (maximized) return;
    onFocus?.(id);
    dragRef.current = {
      mode: "move",
      ox: e.clientX - pos.x,
      oy: e.clientY - pos.y,
    };
    e.preventDefault();
  };
  const onResizeDown = (e: React.MouseEvent) => {
    onFocus?.(id);
    dragRef.current = {
      mode: "resize",
      ox: e.clientX,
      oy: e.clientY,
      sw: pos.w,
      sh: pos.h,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={`ap-win ap-win--accent-${accent} ${minimized ? "ap-win--minimized" : ""} ${topmost === false ? "ap-win--behind" : "ap-win--topmost"}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: pos.w,
        height: minimized ? "auto" : pos.h,
        zIndex,
      }}
      onMouseDown={() => onFocus?.(id)}
    >
      <div className="ap-win__titlebar" onMouseDown={onTitleDown}>
        <span className="ap-win__titledot" />
        <span className="ap-win__title">{title}</span>
        <div className="ap-win__buttons">
          {onMinimize && (
            <button
              className="ap-win__btn"
              title="Minimize"
              onClick={(e) => {
                e.stopPropagation();
                onMinimize(id);
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="1" y="5" width="8" height="1" fill="currentColor" />
              </svg>
            </button>
          )}
          {onMaximize && (
            <button
              className="ap-win__btn"
              title="Maximize"
              onClick={(e) => {
                e.stopPropagation();
                onMaximize(id);
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect
                  x="1"
                  y="1"
                  width="8"
                  height="8"
                  fill="none"
                  stroke="currentColor"
                />
              </svg>
            </button>
          )}
          {onClose && (
            <button
              className="ap-win__btn ap-win__btn--close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(id);
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path
                  d="M1 1 L9 9 M9 1 L1 9"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
      {!minimized && (
        <>
          {statBar && <div className="ap-win__statbar">{statBar}</div>}
          <div className="ap-win__body">{children}</div>
          <div className="ap-win__resize" onMouseDown={onResizeDown} />
        </>
      )}
    </div>
  );
}
