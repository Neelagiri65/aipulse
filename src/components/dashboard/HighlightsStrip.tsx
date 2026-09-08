"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Highlight, HighlightPanelId, HighlightTone } from "@/lib/feed/highlights";

export type HighlightsStripProps = {
  highlights: Highlight[];
  onSelect: (panel: HighlightPanelId, cardId: string) => void;
  variant?: "desktop" | "mobile";
};

/**
 * The chip's mark is ink and its shape carries the state (PRD web-restyle-v2 §7: colour is a
 * word, never a mark). An outage chip is a filled mark, anything unresolved is hatched, a settled
 * one is hollow — the same three shapes the tool rows and the world band use.
 */
const TONE_MARK: Record<HighlightTone, string> = {
  outage: "solid",
  degrade: "hatched",
  info: "hollow",
  neutral: "hollow",
};

export function HighlightsStrip({
  highlights,
  onSelect,
  variant = "desktop",
}: HighlightsStripProps) {
  if (highlights.length === 0) return null;

  if (variant === "mobile") {
    return (
      <div
        className="ap-highlights-strip ap-highlights-strip--mobile"
        role="region"
        aria-label="Top signals right now"
        data-testid="highlights-strip"
      >
        {highlights.map(({ card, panel, tone }) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(panel, card.id)}
            className="ap-highlights-chip"
            style={
              {
              } as CSSProperties
            }
            data-testid="highlights-chip"
            data-card-type={card.type}
            aria-label={`${card.headline} — open ${panel} panel`}
            title={`Source: ${card.sourceName}`}
          >
            <span
              className={`ap-mark ap-mark--${TONE_MARK[tone]} ap-mark--sm`}
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

  return (
    <RotatingTicker highlights={highlights} onSelect={onSelect} />
  );
}

function RotatingTicker({
  highlights,
  onSelect,
}: {
  highlights: Highlight[];
  onSelect: (panel: HighlightPanelId, cardId: string) => void;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (highlights.length <= 1) return;
    const t = setInterval(() => {
      setIdx((prev) => (prev + 1) % highlights.length);
    }, 5000);
    return () => clearInterval(t);
  }, [highlights.length]);

  const safeIdx = idx % highlights.length;
  const { card, panel, tone } = highlights[safeIdx];

  return (
    <div
      className="ap-highlights-strip ap-highlights-strip--desktop"
      role="region"
      aria-label="Top signals right now"
      aria-live="polite"
      data-testid="highlights-strip"
    >
      <button
        key={card.id}
        type="button"
        onClick={() => onSelect(panel, card.id)}
        className="ap-highlights-chip"
        style={
          {
          } as CSSProperties
        }
        data-testid="highlights-chip"
        data-card-type={card.type}
        aria-label={`${card.headline} — open ${panel} panel`}
        title={`Source: ${card.sourceName}`}
      >
        <span
          className={`ap-mark ap-mark--${TONE_MARK[tone]} ap-mark--sm`}
          aria-hidden
        />
        <span className="ap-highlights-chip__headline">{card.headline}</span>
        {card.detail && (
          <span className="ap-highlights-chip__detail">{card.detail}</span>
        )}
      </button>
      {highlights.length > 1 && (
        <span className="ml-auto font-mono text-[9px] text-muted-foreground/50">
          {safeIdx + 1}/{highlights.length}
        </span>
      )}
    </div>
  );
}
