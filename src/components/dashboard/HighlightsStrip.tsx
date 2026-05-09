"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Highlight, HighlightPanelId, HighlightTone } from "@/lib/feed/highlights";

export type HighlightsStripProps = {
  highlights: Highlight[];
  onSelect: (panel: HighlightPanelId, cardId: string) => void;
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
      {highlights.length > 1 && (
        <span className="ml-auto font-mono text-[9px] text-muted-foreground/50">
          {safeIdx + 1}/{highlights.length}
        </span>
      )}
    </div>
  );
}
