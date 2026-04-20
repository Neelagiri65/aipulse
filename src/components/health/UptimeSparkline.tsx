"use client";

import { useState } from "react";
import type { DayBucket } from "@/lib/data/status-history";

export type UptimeSparklineProps = {
  days: DayBucket[];
  /**
   * True when Redis poll samples are feeding the sparkline in addition to
   * the incidents feed. When false, the sparkline is incident-only and days
   * without an incident render as "unknown" (grey) rather than "operational"
   * (green) — we can't claim uptime without having measured it.
   */
  hasSamples: boolean;
};

type Tone = "op" | "degrade" | "regress" | "outage" | "unknown";

function tone(b: DayBucket, hasSamples: boolean): Tone {
  // Impact from incidents is authoritative when present.
  switch (b.worstImpact) {
    case "critical":
      return "outage";
    case "major":
      return "regress";
    case "minor":
      return "degrade";
  }
  // No incident that day — fall through to samples.
  if (b.sampleCount > 0) {
    switch (b.worstStatus) {
      case "major_outage":
        return "outage";
      case "partial_outage":
        return "regress";
      case "degraded":
        return "degrade";
      case "operational":
        return "op";
    }
  }
  // No incident AND no sample → we haven't measured. Don't claim uptime.
  return hasSamples ? "op" : "unknown";
}

const TONE_COLOUR: Record<Tone, string> = {
  op: "var(--sev-op)",
  degrade: "var(--sev-degrade)",
  regress: "var(--sev-regress)",
  outage: "var(--sev-outage)",
  unknown: "rgba(148, 163, 184, 0.22)", // muted slate — explicit "no data"
};

export function UptimeSparkline({ days, hasSamples }: UptimeSparklineProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (days.length === 0) return null;

  const incidentDays = days.filter((d) => d.incidents.length > 0).length;
  const cleanLabel = hasSamples
    ? `${days.length - incidentDays}/${days.length}d clean`
    : incidentDays === 0
      ? `no incidents · 7d`
      : `${incidentDays} incident day${incidentDays === 1 ? "" : "s"} · 7d`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ap-type-spark">7d uptime</span>
        <span className="ap-type-spark text-muted-foreground">
          {cleanLabel}
        </span>
      </div>
      <div className="relative flex gap-0.5">
        {days.map((d, i) => {
          const t = tone(d, hasSamples);
          const colour = TONE_COLOUR[t];
          return (
            <button
              key={d.date}
              type="button"
              aria-label={`${d.date}: ${labelFor(d, hasSamples)}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((n) => (n === i ? null : n))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((n) => (n === i ? null : n))}
              className="group flex-1 cursor-default outline-none"
              style={{
                height: 16,
                background: colour,
                borderRadius: 2,
                boxShadow:
                  t === "unknown"
                    ? "inset 0 0 0 1px rgba(148,163,184,0.18)"
                    : `0 0 6px ${colour}`,
                opacity: t === "unknown" ? 0.55 : 0.92,
              }}
            />
          );
        })}

        {hover !== null && (
          <DayTooltip bucket={days[hover]} hasSamples={hasSamples} index={hover} total={days.length} />
        )}
      </div>
      {!hasSamples && (
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
          Incident-derived · poll-sample history unavailable (no Upstash Redis configured)
        </p>
      )}
    </div>
  );
}

function labelFor(b: DayBucket, hasSamples: boolean): string {
  if (b.incidents.length > 0) {
    return `${b.incidents.length} incident${b.incidents.length === 1 ? "" : "s"} · worst: ${b.worstImpact}`;
  }
  if (b.sampleCount > 0) {
    return `${b.sampleCount} samples · ${b.worstStatus}`;
  }
  return hasSamples ? "no incidents · no samples" : "no incident · not measured";
}

function DayTooltip({
  bucket,
  hasSamples,
  index,
  total,
}: {
  bucket: DayBucket;
  hasSamples: boolean;
  index: number;
  total: number;
}) {
  // Anchor left or right based on position so the tooltip doesn't clip.
  const anchorRight = index > total / 2;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 mt-1 min-w-[200px] max-w-[300px] rounded-md border border-border/60 bg-background/95 p-2.5 shadow-lg backdrop-blur-sm"
      style={{
        top: 20,
        [anchorRight ? "right" : "left"]: 0,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
          {bucket.date}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {bucket.sampleCount > 0 ? `${bucket.sampleCount} samples` : "no samples"}
        </span>
      </div>
      {bucket.incidents.length === 0 ? (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {hasSamples
            ? "No incidents logged · poll samples show operational."
            : "No incidents logged. Uptime not measured without poll samples."}
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {bucket.incidents.slice(0, 4).map((i) => (
            <li key={i.id} className="text-[11px] leading-snug">
              <span
                className="font-mono text-[9px] uppercase tracking-wider"
                style={{ color: impactColour(i.impact) }}
              >
                {i.impact}
              </span>{" "}
              <span className="text-foreground/90">{i.name}</span>
            </li>
          ))}
          {bucket.incidents.length > 4 && (
            <li className="text-[10px] text-muted-foreground">
              +{bucket.incidents.length - 4} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function impactColour(impact: string): string {
  switch (impact) {
    case "critical":
      return "var(--sev-outage)";
    case "major":
      return "var(--sev-regress)";
    case "minor":
      return "var(--sev-degrade)";
    default:
      return "var(--sev-pending)";
  }
}
