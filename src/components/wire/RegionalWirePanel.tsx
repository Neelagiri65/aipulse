"use client";

import type { RssWireResult } from "@/lib/data/wire-rss";
import { CountryPill, LangTag } from "@/components/wire/country-pill";

/**
 * Regional Wire panel — lists the 5 curated publisher feeds sorted by
 * 24h item count (desc; ties broken by display name asc). Each row:
 *
 *   [COUNTRY-PILL] [LANG-TAG?] Publisher Name · 24h count · STALE?
 *
 * Deliberate non-behaviours:
 *   - No scoring, no ranking language. The ordering is purely
 *     "what's most active in the last 24h"; the number is the raw
 *     published-in-last-24h count, not a curated "importance" score.
 *   - No hidden rows. If a source is quiet it shows with a `0 · 24h`
 *     count — the panel is the transparent readout of publisher
 *     activity, not a highlight reel.
 *   - STALE banner when lastFetchOkTs is null or >24h old. Numbers
 *     still render so the reader can see the last known state, but
 *     the staleness is never hidden.
 */

export type RegionalWirePanelProps = {
  data: RssWireResult | undefined;
  error: string | undefined;
  isInitialLoading: boolean;
};

export function RegionalWirePanel({
  data,
  error,
  isInitialLoading,
}: RegionalWirePanelProps) {
  if (isInitialLoading && !data) {
    return (
      <div className="p-3">
        <AwaitingBody />
      </div>
    );
  }
  if (!data || data.source === "unavailable") {
    return (
      <div className="p-3">
        <ErrorBody
          message={error ?? "Regional wire store unavailable — check Redis."}
        />
      </div>
    );
  }
  if (data.sources.length === 0) {
    return (
      <div className="p-3">
        <ErrorBody message="No regional publishers configured." />
      </div>
    );
  }

  const sorted = [...data.sources].sort((a, z) => {
    if (z.itemsLast24h !== a.itemsLast24h) {
      return z.itemsLast24h - a.itemsLast24h;
    }
    return a.displayName.localeCompare(z.displayName);
  });
  const maxCount = Math.max(1, ...sorted.map((s) => s.itemsLast24h));

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 pb-2 pt-3">
        <ul className="space-y-1.5">
          {sorted.map((src, idx) => (
            <SourceRow
              key={src.id}
              src={src}
              rank={idx + 1}
              maxCount={maxCount}
            />
          ))}
        </ul>
      </div>
      <PanelFooter
        polledAt={data.polledAt}
        lastFetchOkTs={data.meta.lastFetchOkTs}
      />
    </div>
  );
}

function SourceRow({
  src,
  rank,
  maxCount,
}: {
  src: RssWireResult["sources"][number];
  rank: number;
  maxCount: number;
}) {
  const pct = Math.round((src.itemsLast24h / maxCount) * 100);
  const loc = [src.city, src.country].filter(Boolean).join(", ");
  return (
    <li className="rounded-md border border-border/40 bg-card/30 p-2 text-[11px] leading-snug">
      <div className="flex items-baseline gap-2">
        <span className="w-5 shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {rank.toString().padStart(2, "0")}
        </span>
        <CountryPill country={src.country} />
        <LangTag lang={src.lang} />
        <a
          href={src.hqSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate font-medium text-foreground underline-offset-2 hover:underline"
          title={src.displayName}
        >
          {src.displayName}
        </a>
        <span
          className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground tabular-nums"
          title={`${src.itemsLast24h} items published in the last 24 hours (${src.itemsLast7d} in the last 7 days)`}
        >
          {src.itemsLast24h} · 24h
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 pl-7 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
        <span className="truncate">{loc || "—"}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {src.itemsLast7d} · 7d
        </span>
        {src.stale && (
          <span
            className="shrink-0 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-[1px] text-[8px] tracking-wider text-amber-400"
            title={
              src.lastFetchOkTs
                ? `Last successful fetch ${src.staleHours}h ago`
                : "No successful fetch recorded — store may be warming up"
            }
          >
            stale
          </span>
        )}
      </div>
      <div className="mt-1 ml-7 h-[3px] rounded-sm bg-white/5" aria-hidden>
        <div
          className="h-full rounded-sm"
          style={{
            width: `${Math.max(2, pct)}%`,
            backgroundColor: "#f97316",
            opacity: src.itemsLast24h === 0 ? 0.25 : 0.85,
          }}
        />
      </div>
    </li>
  );
}

function PanelFooter({
  polledAt,
  lastFetchOkTs,
}: {
  polledAt: string;
  lastFetchOkTs: string | null;
}) {
  const fmt = (iso: string | null) => {
    if (!iso) return "never";
    try {
      return new Date(iso).toISOString().replace("T", " ").slice(0, 16);
    } catch {
      return iso;
    }
  };
  return (
    <div className="border-t border-border/40 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
      <span>Source: </span>
      <a
        href="/data-sources.md"
        target="_blank"
        rel="noopener noreferrer"
        className="underline-offset-2 hover:text-foreground hover:underline"
      >
        5 curated publisher RSS/Atom feeds
      </a>
      <span className="ml-2">· polled {fmt(polledAt)}Z</span>
      <span className="ml-2">· last ingest {fmt(lastFetchOkTs)}Z</span>
    </div>
  );
}

function AwaitingBody() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-6 py-8 text-center font-mono text-[10px] uppercase tracking-wider text-amber-400/90">
      <span>awaiting first regional poll</span>
      <span className="text-amber-400/70">/api/rss · 30min upstream cache</span>
    </div>
  );
}

function ErrorBody({ message }: { message: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-rose-500/40 bg-rose-500/5 px-6 py-8 text-center font-mono text-[10px] uppercase tracking-wider text-rose-400/90">
      <span>regional wire unavailable</span>
      <span className="text-rose-400/70">{message}</span>
    </div>
  );
}
