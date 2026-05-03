"use client";

import { forwardRef } from "react";
import type { RssSourcePanel, RssWireItem } from "@/lib/data/wire-rss";
import { CountryPill, LangTag } from "@/components/wire/country-pill";
import { deriveTranslateUrl, TRANSLATE_LABEL } from "@/lib/i18n/translate-link";
import { TranslatableText } from "@/components/wire/TranslatableText";

/**
 * Full detail card for a single publisher dot on the map. Opens when
 * the user clicks an amber RSS dot (or a cluster where RSS is the
 * majority — delegation happens in event-detail in RSS-04).
 *
 * Shape mirrors LabCard (forwardRef, 380px width, anchored relative to
 * the click point, close button top-right) so the three clickable map
 * layers (HN author, AI-lab HQ, publisher HQ) feel consistent.
 *
 * What it does NOT do:
 *   - No per-item scoring, sentiment, or commentary. Each item row is
 *     the publisher's own title + URL, exactly as served by their feed.
 *   - No synthetic "related articles". Everything here is a straight
 *     join against data the ingest cron already wrote.
 *   - No translation of non-English titles (Heise remains in German).
 *     Translation is an LLM-inference step and would violate the
 *     deterministic-only pipeline discipline.
 */

const CARD_WIDTH = 380;
const CARD_MARGIN = 48;

type SourceCardProps = {
  source: RssSourcePanel;
  anchor: { x: number; y: number };
  containerSize: { w: number; h: number };
  onClose: () => void;
};

export const SourceCard = forwardRef<HTMLDivElement, SourceCardProps>(
  function SourceCard({ source, anchor, containerSize, onClose }, ref) {
    const placeRight = anchor.x + CARD_MARGIN + CARD_WIDTH <= containerSize.w;
    const left = placeRight
      ? anchor.x + CARD_MARGIN
      : Math.max(CARD_MARGIN, anchor.x - CARD_WIDTH - CARD_MARGIN);
    const top = Math.min(
      Math.max(CARD_MARGIN, anchor.y - 40),
      Math.max(CARD_MARGIN, containerSize.h - 340),
    );

    return (
      <div
        ref={ref}
        role="dialog"
        aria-label={`Publisher ${source.displayName}`}
        style={{ left, top, width: CARD_WIDTH, zIndex: 1200 }}
        className="absolute rounded-md border border-border/60 bg-background/95 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8),0_0_60px_-20px_rgba(249,115,22,0.25)] backdrop-blur-md"
      >
        <div className="flex h-7 items-center gap-2 border-b border-border/50 px-2.5 font-mono text-[10px] uppercase tracking-wider text-foreground/70">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: "#f97316",
              boxShadow: "0 0 6px rgba(249,115,22,0.6)",
            }}
            aria-hidden
          />
          <span className="flex-1 truncate">
            <span style={{ color: "#f97316" }}>Regional Publisher</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-5 w-5 items-center justify-center rounded text-foreground/60 hover:bg-white/5 hover:text-foreground"
          >
            <span aria-hidden>×</span>
          </button>
        </div>

        <SourceBody source={source} />
      </div>
    );
  },
);

function SourceBody({ source }: { source: RssSourcePanel }) {
  return (
    <div className="px-2.5 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <CountryPill country={source.country} />
        <LangTag lang={source.lang} />
        {source.stale && (
          <span className="ap-sev-pill ap-sev-pill--pending">STALE</span>
        )}
      </div>
      <div className="mt-1.5 font-mono text-[13px] font-semibold text-foreground">
        <a
          href={source.publisherUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#f97316] hover:underline"
          title={`${source.displayName} — open publisher site`}
        >
          {source.displayName}
        </a>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
        <span className="truncate">
          {source.city}, {source.country}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <a
            href={source.rssUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#f97316] hover:underline"
            title={source.rssUrl}
          >
            rss ↗
          </a>
          <span className="text-foreground/30">·</span>
          <a
            href={source.hqSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#f97316] hover:underline"
            title="HQ coordinate provenance"
          >
            HQ source ↗
          </a>
          {(() => {
            const url = deriveTranslateUrl(source.publisherUrl, source.lang);
            if (!url) return null;
            return (
              <>
                <span className="text-foreground/30">·</span>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#f97316] hover:underline"
                  title={`Open ${source.displayName} via Google Translate`}
                  data-testid="translate-link"
                >
                  {TRANSLATE_LABEL}
                </a>
              </>
            );
          })()}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="ap-type-label text-foreground/60">
          Activity
        </span>
        <span className="font-mono tabular-nums text-foreground/80">
          <span className="ap-type-metric text-foreground">
            {source.itemsLast24h}
          </span>
          <span className="text-[10px] text-foreground/50"> · 24h</span>
          <span className="mx-1 text-[10px] text-foreground/30">/</span>
          <span className="ap-type-metric text-foreground">
            {source.itemsLast7d}
          </span>
          <span className="text-[10px] text-foreground/50"> · 7d</span>
        </span>
      </div>

      {source.stale && (
        <div
          className="mt-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-amber-400"
          title={
            source.lastFetchOkTs
              ? `Last OK fetch ${source.staleHours}h ago`
              : "No successful fetch recorded"
          }
        >
          Stale · numbers shown are last known values
        </div>
      )}

      <div className="mt-2.5 border-t border-border/30 pt-1.5">
        <div className="mb-1 flex items-baseline justify-between font-mono text-[9px] uppercase tracking-wider text-foreground/60">
          <span>Last {source.recentItems.length} items</span>
          {source.recentItems.length === 0 && (
            <span className="text-foreground/40">(none in retention)</span>
          )}
        </div>
        <ul className="space-y-1">
          {source.recentItems.map((item) => (
            <RecentItemRow key={item.id} item={item} />
          ))}
        </ul>
      </div>

      {source.caveat && (
        <div className="mt-2 border-t border-border/30 pt-1.5 font-mono text-[9px] leading-relaxed text-foreground/50">
          <span className="uppercase tracking-wider text-foreground/60">
            Transparency ·{" "}
          </span>
          <span>{source.caveat}</span>
        </div>
      )}
    </div>
  );
}

function RecentItemRow({ item }: { item: RssWireItem }) {
  const publishedIso = new Date(item.publishedTs * 1000).toISOString();
  const rel = relativeTime(item.publishedTs * 1000);
  return (
    <li className="flex items-baseline justify-between gap-2 font-mono text-[10px]">
      <TranslatableText
        text={item.title}
        lang={item.lang}
        linkUrl={item.url}
        textClassName="min-w-0 flex-1 truncate text-foreground/85 hover:text-[#f97316] hover:underline"
        controlClassName="shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground hover:text-[#f97316] hover:underline"
      />
      <span
        className="shrink-0 tabular-nums text-muted-foreground"
        title={publishedIso}
      >
        {rel}
      </span>
    </li>
  );
}

function relativeTime(ts: number): string {
  const deltaMs = Date.now() - ts;
  if (deltaMs < 0) return "now";
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
