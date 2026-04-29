"use client";

/**
 * Highlights strip — "something changed, pay attention" surface that
 * sits below the StatusBar and surfaces the top-N feed cards by
 * severity. Each chip is clickable: click → host opens the panel that
 * surfaces the deeper data for that card type.
 *
 * Presentational only. Selection logic + panel mapping live in
 * `src/lib/feed/highlights.ts` so the rule stays unit-testable and
 * disconnected from layout. Returning null when there are no
 * highlights keeps the component cheap to render on every poll;
 * callers don't need to gate the mount.
 *
 * Per memory `feedback_trust_bar.md` — every chip names a specific
 * source and links to the panel that explains it. No invented copy:
 * the headline is taken verbatim from the underlying Card.
 */

import type { CSSProperties } from "react";
import type { Highlight, HighlightPanelId, HighlightTone } from "@/lib/feed/highlights";

export type HighlightsStripProps = {
  highlights: Highlight[];
  onSelect: (panel: HighlightPanelId, cardId: string) => void;
  /**
   * Layout flavour. `desktop` is a fixed bar below the global StatusBar;
   * `mobile` is an inline horizontal scroller. Both share chip styling.
   */
  variant?: "desktop" | "mobile";
};

const TONE_DOT: Record<HighlightTone, string> = {
  outage: "var(--sev-outage)",
  degrade: "var(--sev-degrade)",
  info: "var(--sev-info, #38bdf8)",
  neutral: "var(--ap-fg-muted, #7a8a90)",
};

const TONE_RING: Record<HighlightTone, string> = {
  outage: "rgba(244, 63, 94, 0.35)",
  degrade: "rgba(245, 158, 11, 0.35)",
  info: "rgba(56, 189, 248, 0.35)",
  neutral: "rgba(122, 138, 144, 0.25)",
};

export function HighlightsStrip({
  highlights,
  onSelect,
  variant = "desktop",
}: HighlightsStripProps) {
  if (highlights.length === 0) return null;

  const wrapClass =
    variant === "desktop"
      ? "ap-highlights-strip ap-highlights-strip--desktop"
      : "ap-highlights-strip ap-highlights-strip--mobile";

  return (
    <div
      className={wrapClass}
      role="region"
      aria-label="Top signals right now"
      data-testid="highlights-strip"
    >
      {variant === "desktop" && (
        <span
          className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/80"
          aria-hidden
        >
          Now
        </span>
      )}
      {highlights.map(({ card, panel, tone }) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onSelect(panel, card.id)}
          className="ap-highlights-chip"
          style={
            {
              "--chip-dot": TONE_DOT[tone],
              "--chip-ring": TONE_RING[tone],
            } as CSSProperties
          }
          data-testid="highlights-chip"
          data-card-type={card.type}
          aria-label={`${card.headline} — open ${panel} panel`}
          title={`Source: ${card.sourceName}`}
        >
          <span
            className="ap-highlights-chip__dot"
            style={{ background: TONE_DOT[tone] }}
            aria-hidden
          />
          <span className="ap-highlights-chip__headline">{card.headline}</span>
          {card.detail && (
            <span className="ap-highlights-chip__detail">{card.detail}</span>
          )}
        </button>
      ))}
    </div>
  );
}
