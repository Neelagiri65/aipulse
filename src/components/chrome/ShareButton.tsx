"use client";

/**
 * ShareButton — compact copy-link affordance. Clicks try the Web Share
 * API first (native share sheet on mobile) and fall back to writing the
 * current URL to the clipboard. Either way the click fires a
 * `share_click` analytics event (gated by consent in the track wrapper).
 *
 * Lives in the StatusBar so share-to-stakeholder is one click from any
 * view. Kept deliberately minimal — no share-card generator yet; that
 * arrives with Sparkline retrofit (session 36) when panel-scoped
 * permalinks make individual insights shareable.
 */

import { useCallback, useState } from "react";
import { track } from "@/lib/analytics";

type Phase = "idle" | "copied" | "shared" | "error";

export function ShareButton(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>("idle");

  const onClick = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const title = document.title;

    // Prefer the native share sheet on mobile. Desktop Safari/Chrome
    // without Web Share falls through to clipboard.
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title, url });
        track("share_click", { method: "webshare" });
        setPhase("shared");
        setTimeout(() => setPhase("idle"), 1500);
        return;
      } catch {
        /* user dismissed or API failed — fall through to clipboard */
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      track("share_click", { method: "clipboard" });
      setPhase("copied");
      setTimeout(() => setPhase("idle"), 1500);
    } catch {
      track("share_click", { method: "error" });
      setPhase("error");
      setTimeout(() => setPhase("idle"), 1500);
    }
  }, []);

  const label =
    phase === "copied"
      ? "Copied"
      : phase === "shared"
        ? "Shared"
        : phase === "error"
          ? "Copy failed"
          : "Share";

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="share-button"
      className="inline-flex items-center gap-1 rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      aria-label="Share this view"
    >
      <ShareIcon />
      <span>{label}</span>
    </button>
  );
}

function ShareIcon(): React.JSX.Element {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 9.5v2.25A1.25 1.25 0 005.25 13h5.5A1.25 1.25 0 0012 11.75V9.5" />
      <path d="M8 2.5v7" />
      <path d="M5.5 5L8 2.5 10.5 5" />
    </svg>
  );
}
