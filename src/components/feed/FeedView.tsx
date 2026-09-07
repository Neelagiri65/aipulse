"use client";

/**
 * Gawk — Mobile feed view.
 *
 * Client component. Polls /api/feed every 60s (matching the route's
 * s-maxage), renders a vertical scroll of FeedCard, surfaces the
 * QuietDayBanner when the API says so, and falls back to honest
 * loading / error states (no blank screen).
 *
 * `initialResponse` is an optional prop used by SSR + tests. When
 * provided, the component renders synchronously on first paint with
 * the supplied FeedResponse and continues to poll in the background
 * (the tests pass `disablePolling: true` to opt out).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { FeedReading, formatAge } from "@/components/feed/FeedReading";
import { QuietDayBanner } from "@/components/feed/QuietDayBanner";
import { VERIFIED_SOURCES } from "@/lib/data-sources";
import type { Card, CardType, FeedResponse } from "@/lib/feed/types";
import { KIND_LABEL, KIND_PLURAL, rowMark } from "@/lib/feed/why-surfaced";

const POLL_INTERVAL_MS = 60_000;

export type FeedViewProps = {
  initialResponse?: FeedResponse;
  /**
   * Test-only escape hatch: when true, no /api/feed polling runs.
   * Used by unit tests that want to assert the rendered shape against
   * a fixed FeedResponse without dealing with timers or network mocks.
   */
  disablePolling?: boolean;
  /**
   * desktop (default): list left, the selected card's reading surface right (PRD §8).
   * mobile: the rows alone; a row is a link to the card's own page (PRD §10).
   */
  variant?: "desktop" | "mobile";
};

const KINDS: readonly CardType[] = [
  "TOOL_ALERT",
  "MODEL_MOVER",
  "NEW_RELEASE",
  "SDK_TREND",
  "PRODUCT_LAUNCH",
  "NEWS",
  "RESEARCH",
  "LAB_HIGHLIGHT",
];

function hhmmUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function FeedView({ initialResponse, disablePolling, variant = "desktop" }: FeedViewProps) {
  const [data, setData] = useState<FeedResponse | undefined>(initialResponse);
  const [error, setError] = useState<string | undefined>(undefined);
  // Reference time for ages: seeded from the response's own computed time (pure), then the clock
  // after mount and every 30 s. Never Date.now() during render.
  const [nowMs, setNowMs] = useState<number>(() => {
    const t = initialResponse ? new Date(initialResponse.lastComputed).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  });
  const [kind, setKind] = useState<CardType | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cards = data?.cards;
  const counts = useMemo(() => {
    const c = new Map<CardType, number>();
    for (const card of cards ?? []) c.set(card.type, (c.get(card.type) ?? 0) + 1);
    return c;
  }, [cards]);
  const visible = useMemo(
    () => (cards ?? []).filter((card) => kind === "all" || card.type === kind),
    [cards, kind],
  );
  // The selection survives a poll: resolved by id on every render, first visible row otherwise.
  const selected: Card | undefined = visible.find((c) => c.id === selectedId) ?? visible[0];

  useEffect(() => {
    if (disablePolling) return;
    let cancelled = false;
    const ctrl = new AbortController();

    async function tick() {
      try {
        const res = await fetch("/api/feed", { signal: ctrl.signal });
        if (!res.ok) throw new Error(`/api/feed returned ${res.status}`);
        const json = (await res.json()) as FeedResponse;
        if (cancelled) return;
        setNowMs(Date.now());
        setData(json);
        setError(undefined);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    tick();
    const t = setInterval(tick, POLL_INTERVAL_MS);
    const tick2 = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(t);
      clearInterval(tick2);
    };
  }, [disablePolling]);

  if (!data && error) {
    return (
      <div
        className="ap-feed-view"
        data-feed-state="error"
        role="alert"
      >
        <p>Feed unavailable. Try MAP or PANELS while we recover.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="ap-feed-view"
        data-feed-state="loading"
        role="status"
        aria-label="Loading the Gawk feed"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ap-feed-card-skeleton animate-pulse" aria-hidden>
            <div className="h-3 w-24 rounded bg-muted/60 mb-2" />
            <div className="h-4 w-full rounded bg-muted/60 mb-1" />
            <div className="h-4 w-3/4 rounded bg-muted/40" />
          </div>
        ))}
      </div>
    );
  }

  const kindsPresent = KINDS.filter((k) => (counts.get(k) ?? 0) > 0);
  const rowsHead = `${visible.length} card${visible.length === 1 ? "" : "s"} · computed ${hhmmUtc(data.lastComputed)}`;

  return (
    <div className="ap-feed-view" data-feed-state="ready" data-variant={variant}>
      <div className="ap-feed-pane">
        {data.staleSources && data.staleSources.length > 0 ? (
          <StaleSourcesNotice sources={data.staleSources} />
        ) : null}
        {data.quietDay ? (
          <QuietDayBanner currentState={data.currentState} />
        ) : null}
        <div className="ap-kchips" role="tablist" aria-label="Card kinds">
          <button
            type="button"
            role="tab"
            aria-selected={kind === "all"}
            className={`ap-kchip${kind === "all" ? " is-on" : ""}`}
            onClick={() => setKind("all")}
          >
            All <span className="ap-kchip__n">{cards?.length ?? 0}</span>
          </button>
          {kindsPresent.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={`ap-kchip${kind === k ? " is-on" : ""}`}
              onClick={() => setKind(k)}
            >
              {KIND_PLURAL[k]} <span className="ap-kchip__n">{counts.get(k)}</span>
            </button>
          ))}
        </div>
        <div className="ap-inset ap-feedrows" data-testid="feed-rows">
          <div className="ap-inset__head ap-inset__head--split">
            <span>Feed · since the last quiet hour</span>
            <span>{rowsHead}</span>
          </div>
          <ul className="ap-feed-list">
            {visible.map((card) => {
              const isSelected = variant === "desktop" && selected?.id === card.id;
              const inner = (
                <>
                  <span className={`ap-mark ap-mark--${rowMark(card)}`} aria-hidden />
                  <span className="ap-trow__body">
                    <span className="ap-trow__title">{card.headline}</span>
                    <span className="ap-trow__cap">
                      {KIND_LABEL[card.type]} · {card.sourceName} ·{" "}
                      {formatAge(nowMs - new Date(card.timestamp).getTime())}
                    </span>
                  </span>
                  <span className="ap-trow__chev" aria-hidden>
                    ›
                  </span>
                </>
              );
              return (
                <li
                  key={card.id}
                  className={`ap-feed-list-item ap-trow${isSelected ? " is-selected" : ""}`}
                  data-card-type={card.type}
                  data-severity={card.severity}
                >
                  {variant === "mobile" ? (
                    <Link href={`/feed/${card.id}`} className="ap-trow__head ap-feedrow">
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="ap-trow__head ap-feedrow"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => setSelectedId(card.id)}
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
            {visible.length === 0 ? (
              <li className="ap-feed-list-item ap-trow ap-feedrows__empty">No cards of this kind in the feed right now.</li>
            ) : null}
          </ul>
        </div>
        <p className="ap-feedrows__foot">
          Rows are the cards the feed derived from its sources, in the locked severity order, newest first
          within a tier. Nothing is scored. A quiet day says so above the list.
        </p>
        <div className="ap-inset ap-howbuilt">
          <div className="ap-howbuilt__head">How this feed is built</div>
          <p className="ap-howbuilt__body">
            A state change on a tracked status page, a rank move on OpenRouter, a download swing on a
            registry, a curated source crossing its threshold: each becomes one card with its source and
            time. Nothing is ranked or scored beyond the locked severity tiers.
          </p>
          <p className="ap-howbuilt__src">
            <a href="/methodology">Thresholds on the methodology page</a> · <a href="/sources">{VERIFIED_SOURCES.length} verified sources</a>
          </p>
        </div>
      </div>
      {variant === "desktop" && selected ? <FeedReading card={selected} nowMs={nowMs} /> : null}
    </div>
  );
}

function StaleSourcesNotice({
  sources,
}: {
  sources: NonNullable<FeedResponse["staleSources"]>;
}) {
  const labels = sources
    .map((s) => `${s.source} (as of ${formatRelative(s.staleAsOf)})`)
    .join(" · ");
  return (
    <div
      className="ap-feed-stale-notice"
      data-stale-sources={sources.length}
      role="note"
    >
      Live fetch failed — serving cache: {labels}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffMin = Math.max(1, Math.round((Date.now() - then) / 60_000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
