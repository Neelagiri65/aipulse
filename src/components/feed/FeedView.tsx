"use client";

/**
 * Gawk — Mobile feed view.
 *
 * Client component. Polls /api/feed every 60s (matching the route's
 * s-maxage), renders a vertical scroll of FeedCard, surfaces the
 * QuietDayBanner when the API says so, and falls back to honest
 * loading / error states (no blank screen).
 *
 * `initialResponse` is an optional prop used by tests and SSR
 * preview surfaces — pass a FeedResponse to render synchronously
 * without waiting on the network.
 */

import { useEffect, useState } from "react";

import { FeedCard } from "@/components/feed/FeedCard";
import { QuietDayBanner } from "@/components/feed/QuietDayBanner";
import type { FeedResponse } from "@/lib/feed/types";

const POLL_INTERVAL_MS = 60_000;

export type FeedViewProps = {
  initialResponse?: FeedResponse;
};

export function FeedView({ initialResponse }: FeedViewProps) {
  const [data, setData] = useState<FeedResponse | undefined>(initialResponse);
  const [error, setError] = useState<string | undefined>(undefined);
  const [, force] = useState(0);

  useEffect(() => {
    if (initialResponse) return;
    let cancelled = false;
    const ctrl = new AbortController();

    async function tick() {
      try {
        const res = await fetch("/api/feed", { signal: ctrl.signal });
        if (!res.ok) throw new Error(`/api/feed returned ${res.status}`);
        const json = (await res.json()) as FeedResponse;
        if (cancelled) return;
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
    const tick2 = setInterval(() => force((n) => n + 1), 30_000);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(t);
      clearInterval(tick2);
    };
  }, [initialResponse]);

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

  return (
    <div className="ap-feed-view" data-feed-state="ready">
      {data.quietDay ? (
        <QuietDayBanner currentState={data.currentState} />
      ) : null}
      <ul className="ap-feed-list">
        {data.cards.map((card) => (
          <li key={card.id} className="ap-feed-list-item">
            <FeedCard card={card} />
          </li>
        ))}
      </ul>
    </div>
  );
}
