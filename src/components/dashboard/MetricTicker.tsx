"use client";

import type { GlobeEventsResult } from "@/lib/data/fetch-events";
import type { StatusResult } from "@/lib/data/fetch-status";
import { getSourceById } from "@/lib/data-sources";

export type MetricTickerProps = {
  status?: StatusResult;
  events?: GlobeEventsResult;
  verifiedSourceCount: number;
  pendingSourceCount: number;
  /** True until the first status poll lands. */
  statusLoading: boolean;
  /** True until the first events poll lands. */
  eventsLoading: boolean;
};

type Metric = {
  label: string;
  value: string;
  sourceIds: string[];
  /** Optional freshness stamp, e.g. poll age. */
  stamp?: string;
  /** Tone: neutral (default), good (emerald), warn (amber), bad (rose), pending (muted italic). */
  tone?: "neutral" | "good" | "warn" | "bad" | "pending";
};

export function MetricTicker({
  status,
  events,
  verifiedSourceCount,
  pendingSourceCount,
  statusLoading,
  eventsLoading,
}: MetricTickerProps) {
  const metrics: Metric[] = [
    claudeCodeIssuesMetric(status, statusLoading),
    aiEventsMetric(events, eventsLoading),
    aiConfigRatioMetric(events, eventsLoading),
    toolsOperationalMetric(status, statusLoading),
    coverageMetric(events, eventsLoading),
    sourcesVerifiedMetric(verifiedSourceCount, pendingSourceCount),
  ];

  return (
    <section
      aria-label="Dashboard metric ticker"
      className="border-t border-border/60 bg-background/60 backdrop-blur-sm"
    >
      <div className="mx-auto flex w-full max-w-[1600px] divide-x divide-border/40 overflow-x-auto">
        {metrics.map((m, i) => (
          <MetricCell key={i} metric={m} />
        ))}
      </div>
    </section>
  );
}

function MetricCell({ metric }: { metric: Metric }) {
  const toneClass = toneClassname(metric.tone);
  return (
    <div className="min-w-[180px] flex-1 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`ap-type-metric ${toneClass}`}>
          {metric.value}
        </span>
        {metric.stamp && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
            {metric.stamp}
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate ap-type-label">
        {metric.label}
      </div>
      <SourceCitation ids={metric.sourceIds} />
    </div>
  );
}

function SourceCitation({ ids }: { ids: string[] }) {
  if (ids.length === 0) {
    return (
      <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
        src:{" "}
        <a
          href="/data-sources.md"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          registry
        </a>
      </div>
    );
  }
  const sources = ids.map((id) => getSourceById(id)).filter(Boolean);
  if (sources.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
      <span>src:</span>
      {sources.map((s, i) => (
        <a
          key={s!.id}
          href={s!.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          {s!.id}
          {i < sources.length - 1 ? "," : ""}
        </a>
      ))}
    </div>
  );
}

function toneClassname(tone: Metric["tone"]): string {
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
      return "text-foreground";
  }
}

const LOADING_VALUE = "loading…";
const NO_DATA_VALUE = "no data";

// --- Metric builders --------------------------------------------------------
// Cell-state contract:
//   loading → poll has not landed yet (initial cold start)
//   no data → poll landed but the upstream value is genuinely missing
//   value  → real number from a real source

function claudeCodeIssuesMetric(status: StatusResult | undefined, loading: boolean): Metric {
  if (loading && !status) {
    return {
      label: "Claude Code open issues",
      value: LOADING_VALUE,
      sourceIds: ["gh-issues-claude-code"],
      tone: "pending",
    };
  }
  const n = status?.data["claude-code"]?.openIssues;
  return {
    label: "Claude Code open issues",
    value: n !== undefined ? n.toLocaleString() : NO_DATA_VALUE,
    sourceIds: ["gh-issues-claude-code"],
    tone: n !== undefined ? "neutral" : "pending",
    stamp: status?.data["claude-code"]?.lastCheckedAt
      ? pollAge(status.data["claude-code"].lastCheckedAt)
      : undefined,
  };
}

function aiEventsMetric(events: GlobeEventsResult | undefined, loading: boolean): Metric {
  if (loading && !events) {
    return {
      label: "Placeable events",
      value: LOADING_VALUE,
      sourceIds: ["gh-events"],
      tone: "pending",
    };
  }
  const n = events?.coverage.windowSize ?? 0;
  const window = events?.coverage.windowMinutes ?? 60;
  return {
    label: `Placeable events · ${window}m window`,
    value: n > 0 ? n.toLocaleString() : NO_DATA_VALUE,
    sourceIds: ["gh-events"],
    tone: n > 0 ? "neutral" : "pending",
    stamp: events?.polledAt ? pollAge(events.polledAt) : undefined,
  };
}

function aiConfigRatioMetric(events: GlobeEventsResult | undefined, loading: boolean): Metric {
  if (loading && !events) {
    return {
      label: "Repos with AI config",
      value: LOADING_VALUE,
      sourceIds: ["gh-contents"],
      tone: "pending",
    };
  }
  const total = events?.coverage.windowSize ?? 0;
  const ai = events?.coverage.windowAiConfig ?? 0;
  const pct = total > 0 ? Math.round((ai / total) * 100) : undefined;
  return {
    label: "Repos with AI config",
    value: pct !== undefined ? `${ai.toLocaleString()} · ${pct}%` : NO_DATA_VALUE,
    sourceIds: ["gh-contents"],
    tone: pct !== undefined && pct > 0 ? "good" : "pending",
  };
}

function toolsOperationalMetric(status: StatusResult | undefined, loading: boolean): Metric {
  if (loading && !status) {
    return {
      label: "Tools operational",
      value: LOADING_VALUE,
      sourceIds: ["anthropic-status", "openai-status", "github-status"],
      tone: "pending",
    };
  }
  if (!status) {
    return {
      label: "Tools operational",
      value: NO_DATA_VALUE,
      sourceIds: ["anthropic-status", "openai-status", "github-status"],
      tone: "pending",
    };
  }
  const values = Object.values(status.data);
  const total = values.length;
  // Active incident folds into "not operational" — same lie-fix as TopBar.
  const ok = values.filter(
    (v) => v?.status === "operational" && (v.activeIncidents?.length ?? 0) === 0,
  ).length;
  if (total === 0) {
    return {
      label: "Tools operational",
      value: NO_DATA_VALUE,
      sourceIds: ["anthropic-status", "openai-status", "github-status"],
      tone: "pending",
    };
  }
  const tone: Metric["tone"] =
    ok === total ? "good" : ok === 0 ? "bad" : "warn";
  return {
    label: "Tools operational",
    value: `${ok} / ${total}`,
    sourceIds: ["anthropic-status", "openai-status", "github-status"],
    tone,
  };
}

function coverageMetric(events: GlobeEventsResult | undefined, loading: boolean): Metric {
  if (loading && !events) {
    return {
      label: "Geocoder coverage · last poll",
      value: LOADING_VALUE,
      sourceIds: ["gh-events"],
      tone: "pending",
    };
  }
  const pct = events?.coverage.locationCoveragePct;
  const tone: Metric["tone"] =
    pct === undefined
      ? "pending"
      : pct >= 30
        ? "good"
        : pct >= 10
          ? "warn"
          : "bad";
  return {
    label: "Geocoder coverage · last poll",
    value: pct !== undefined ? `${pct}%` : NO_DATA_VALUE,
    sourceIds: ["gh-events"],
    tone,
  };
}

function sourcesVerifiedMetric(verified: number, pending: number): Metric {
  return {
    label: pending > 0 ? `Sources verified · ${pending} pending` : "Sources verified",
    value: `${verified}`,
    sourceIds: [],
    tone: pending === 0 ? "good" : "neutral",
  };
}

function pollAge(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.max(0, Math.floor(diff / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h`;
  } catch {
    return "";
  }
}
