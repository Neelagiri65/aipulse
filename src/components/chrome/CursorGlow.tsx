"use client";

import { useEffect } from "react";

/**
 * Soft warm radial glow that follows the cursor. Pure decoration; pointer-events: none.
 * Ambient layer behind the dashboard chrome — see .ap-cursor-glow in globals.css.
 */
export function CursorGlow() {
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const root = document.documentElement;
      root.style.setProperty("--ap-mx", `${e.clientX}px`);
      root.style.setProperty("--ap-my", `${e.clientY}px`);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return <div className="ap-cursor-glow" aria-hidden />;
}
