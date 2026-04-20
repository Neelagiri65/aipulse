"use client";

import type { GlobeEventsResult } from "@/lib/data/fetch-events";
import type { StatusResult } from "@/lib/data/fetch-status";

export type MetricsRowProps = {
  status?: StatusResult;
  events?: GlobeEventsResult;
  statusLoading: boolean;
  eventsLoading: boolean;
};

type Card = {
  label: string;
  value: string;
  hint?: string;
  tone: "accent" | "good" | "warn" | "bad" | "pending";
};

/**
 * Four-card glance row pinned above the MetricTicker. Every number comes
 * from the existing /api/status or /api/globe-events pipeline — no fake
 * sparklines, no invented trust indices. When a poll hasn't landed we
 * say "loading…" rather than showing a zero that looks like real data.
 */
export function MetricsRow({
  status,
  events,
  statusLoading,
  eventsLoading,
}: MetricsRowProps) {
  const cards: Card[] = [
    aiCfgEventsCard(events, eventsLoading),
    aiCfgShareCard(events, eventsLoading),
    eventsWindowCard(events, eventsLoading),
    toolsOpsCard(status, statusLoading),
  ];

  return (
    <div
      className="pointer-events-none fixed bottom-[96px] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 pb-1"
      aria-label="Headline metrics"
    >
      {cards.map((card, i) => (
        <div
          key={i}
          className="pointer-events-auto ap-panel-surface flex flex-col gap-1 px-4 py-2"
          style={{ width: 176, minHeight: 68 }}
        >
          <span className="ap-type-label">{card.label}</span>
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`ap-type-metric ${toneClass(card.tone)}`}
            >
              {card.value}
            </span>
            {card.hint && (
              <span
                className="font-mono text-[10px] uppercase"
                style={{ color: "var(--ap-fg-dim)", letterSpacing: "0.08em" }}
              >
                {card.hint}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function toneClass(tone: Card["tone"]): string {
  switch (tone) {
    case "good":
      return "text-emerald-400";
    case "warn":
      return "text-amber-400";
    case "bad":
      return "text-rose-400";
    case "pending":
      return "text-muted-foreground/70 italic";
    default:
      return "text-teal-300";
  }
}

function aiCfgEventsCard(
  events: GlobeEventsResult | undefined,
  loading: boolean,
): Card {
  if (loading && !events) return pending("AI-cfg events");
  const n = events?.coverage.windowAiConfig ?? 0;
  return {
    label: "AI-cfg events",
    value: n.toLocaleString(),
    hint: `${events?.coverage.windowMinutes ?? 120}m`,
    tone: n > 0 ? "accent" : "pending",
  };
}

function aiCfgShareCard(
  events: GlobeEventsResult | undefined,
  loading: boolean,
): Card {
  if (loading && !events) return pending("AI-cfg share");
  const total = events?.coverage.windowSize ?? 0;
  const ai = events?.coverage.windowAiConfig ?? 0;
  if (total === 0) return { label: "AI-cfg share", value: "—", tone: "pending" };
  const pct = Math.round((ai / total) * 100);
  return {
    label: "AI-cfg share",
    value: `${pct}%`,
    hint: `of ${total}`,
    tone: pct >= 25 ? "good" : "accent",
  };
}

function eventsWindowCard(
  events: GlobeEventsResult | undefined,
  loading: boolean,
): Card {
  if (loading && !events) return pending("Events / window");
  const n = events?.coverage.windowSize ?? 0;
  const window = events?.coverage.windowMinutes ?? 120;
  return {
    label: "Events / window",
    value: n.toLocaleString(),
    hint: `${window}m`,
    tone: n > 0 ? "accent" : "pending",
  };
}

function toolsOpsCard(
  status: StatusResult | undefined,
  loading: boolean,
): Card {
  if (loading && !status) return pending("Tools ops");
  if (!status) return { label: "Tools ops", value: "—", tone: "pending" };
  const values = Object.values(status.data);
  const total = values.length;
  // Same fold as TopBar: active incident → not operational, even if the
  // component pill is green.
  const ok = values.filter(
    (v) =>
      v?.status === "operational" && (v.activeIncidents?.length ?? 0) === 0,
  ).length;
  const tone: Card["tone"] =
    total === 0 ? "pending" : ok === total ? "good" : ok === 0 ? "bad" : "warn";
  return {
    label: "Tools ops",
    value: total === 0 ? "—" : `${ok} / ${total}`,
    tone,
  };
}

function pending(label: string): Card {
  return { label, value: "loading…", tone: "pending" };
}
