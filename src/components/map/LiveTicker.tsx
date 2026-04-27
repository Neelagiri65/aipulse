"use client";

/**
 * AI Pulse — Bloomberg-style live ticker.
 *
 * Horizontal-scrolling strip rendered below the map. Pulls the
 * most-recent 15 entries from the existing wire-rows feed (already
 * filtered to AI-relevant) and scrolls right-to-left in a continuous
 * loop via CSS @keyframes. Pauses on hover so users can read.
 *
 * Format: "● <kind> <summary> Xm ago · ● ..."
 * Each entry links to its primary public source.
 */

import type { WireItem } from "@/components/dashboard/WirePage";

const TICKER_LIMIT = 15;

export type LiveTickerProps = {
  rows: WireItem[];
  /** Reference time for relative-age rendering. Defaults to Date.now(). */
  nowMs?: number;
};

export function LiveTicker({ rows, nowMs }: LiveTickerProps) {
  const items = rows.slice(0, TICKER_LIMIT);
  if (items.length === 0) {
    return (
      <div className="ap-live-ticker ap-live-ticker--empty" role="status">
        <span className="ap-live-ticker-empty-text">awaiting first events…</span>
      </div>
    );
  }

  const ref = nowMs ?? Date.now();

  return (
    <div className="ap-live-ticker" role="status" aria-label="Live event ticker">
      <div className="ap-live-ticker-track">
        {/* Render the items twice so the seamless loop has nothing to
            jump back to — the second copy slides in as the first
            slides out. */}
        <TickerSequence items={items} nowMs={ref} keyPrefix="a" />
        <TickerSequence items={items} nowMs={ref} keyPrefix="b" aria-hidden />
      </div>
    </div>
  );
}

function TickerSequence({
  items,
  nowMs,
  keyPrefix,
  ...rest
}: {
  items: WireItem[];
  nowMs: number;
  keyPrefix: string;
  "aria-hidden"?: boolean;
}) {
  return (
    <div className="ap-live-ticker-sequence" {...rest}>
      {items.map((item, i) => (
        <TickerEntry key={`${keyPrefix}-${entryKey(item, i)}`} item={item} nowMs={nowMs} />
      ))}
    </div>
  );
}

function TickerEntry({ item, nowMs }: { item: WireItem; nowMs: number }) {
  if (item.kind === "gh") {
    const ageMs = Math.max(0, nowMs - new Date(item.createdAt).getTime());
    return (
      <span className="ap-live-ticker-item" data-kind="gh">
        <span className="ap-live-ticker-bullet" aria-hidden>●</span>
        <span className="ap-live-ticker-label">{item.type.replace("Event", "")}</span>
        <span className="ap-live-ticker-meta">
          @{item.actor} · {item.repo} · {formatAge(ageMs)}
        </span>
        <span className="ap-live-ticker-sep" aria-hidden>·</span>
      </span>
    );
  }
  // hn
  const ageMs = Math.max(0, nowMs - new Date(item.createdAt).getTime());
  return (
    <span className="ap-live-ticker-item" data-kind="hn">
      <span className="ap-live-ticker-bullet" aria-hidden style={{ color: "#ff6600" }}>●</span>
      <span className="ap-live-ticker-label">HN</span>
      <a
        className="ap-live-ticker-meta ap-live-ticker-link"
        href={item.hnUrl}
        target="_blank"
        rel="noreferrer"
      >
        {truncate(item.title, 60)} · {item.points}↑ · {formatAge(ageMs)}
      </a>
      <span className="ap-live-ticker-sep" aria-hidden>·</span>
    </span>
  );
}

function entryKey(item: WireItem, fallback: number): string {
  if (item.kind === "gh") return `gh:${item.eventId}`;
  if (item.kind === "hn") return `hn:${item.id}`;
  return `idx:${fallback}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function formatAge(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
