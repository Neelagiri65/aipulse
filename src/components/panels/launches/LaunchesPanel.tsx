"use client";

/**
 * LaunchesPanel — dashboard view for the day's top Product Hunt launches in
 * the "Artificial Intelligence" topic. Reads the DTO from
 * /api/panels/producthunt and renders one row per launch (rank, name +
 * tagline linking to the public PH page, upvote count).
 *
 * Honest by construction: Product Hunt launches have no reliable location,
 * so they live here as a ranked list, never plotted on the geographic map.
 * Empty state when PRODUCT_HUNT_TOKEN is unset or the fetch failed — no
 * fabricated rows. Visual language matches AgentsPanel (font-mono numerals,
 * border-border/40 bg-card/30 cards).
 */

import * as React from "react";
import type { ProductHuntResult } from "@/lib/data/fetch-producthunt";

export type LaunchesPanelProps = {
  data: ProductHuntResult | undefined;
  error: string | undefined;
  isInitialLoading: boolean;
};

function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function LaunchesPanel({
  data,
  error,
  isInitialLoading,
}: LaunchesPanelProps): React.ReactElement {
  if (isInitialLoading && !data) {
    return (
      <div className="p-3" role="status" aria-label="Loading Product Hunt launches">
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-md border border-border/40 bg-card/30"
              aria-hidden
            />
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.posts || data.posts.length === 0) {
    return (
      <div
        className="m-3 flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-6 py-8 text-center font-mono text-[10px] uppercase tracking-wider text-amber-400/90"
        role="status"
      >
        <p>No Product Hunt launches yet.</p>
        <p className="text-amber-400/70">
          {error
            ? `Last poll error: ${error}`
            : "Set PRODUCT_HUNT_TOKEN to enable this source."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 pb-2 pt-3">
        <ul className="space-y-1.5">
          {data.posts.map((post, idx) => (
            <li
              key={post.id}
              className="rounded-md border border-border/40 bg-card/30 p-2 text-[11px] leading-snug"
              data-ph-id={post.id}
            >
              <div className="flex items-baseline gap-2">
                <span className="w-5 shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  {(idx + 1).toString().padStart(2, "0")}
                </span>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {post.name}
                </a>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                  ▲ {formatCount(post.votesCount)}
                </span>
              </div>
              {post.tagline ? (
                <p className="mt-0.5 pl-7 text-[10px] text-muted-foreground line-clamp-2">
                  {post.tagline}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border/40 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        Product Hunt · AI topic{data.generatedAt ? ` · as of ${new Date(data.generatedAt).toLocaleTimeString("en-GB")}` : ""}
      </div>
    </div>
  );
}
