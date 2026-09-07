/**
 * gawk.dev — Health row state (web v2 phase 3, PRD web-restyle-v2 §7).
 *
 * State is carried by SHAPE, colour by WORDS: a solid mark = working at the last check, a hatched
 * mark = an incident or a non-operational declaration, a hollow mark = nothing measured. Green is
 * only ever the word "operational", red only the words "… outage"; degraded / partial / unknown
 * stay ink. This module is pure so the branching is unit-tested; components only render it.
 */

import type { DayBucket } from "@/lib/data/status-history";
import type { ToolConfig, ToolHealthData } from "./tools";
import { allSourcesVerified } from "./tools";

export type Mark = "solid" | "hatched" | "hollow";
export type WordTone = "op" | "out" | "ink";
export type RowMode = "no-data" | "pending" | "awaiting" | "live";

export type RowState = {
  mode: RowMode;
  mark: Mark;
  /** The state word shown once per row, exactly as the vendor declares it (or our own gap word). */
  word: string;
  tone: WordTone;
  /** True when the row belongs in the "incidents first" group and opens its detail by default. */
  exception: boolean;
  activeIncidents: number;
};

export function deriveRowMode(config: ToolConfig, data?: ToolHealthData): RowMode {
  if (config.noPublicSource) return "no-data";
  if (!allSourcesVerified(config)) return "pending";
  if (data === undefined) return "awaiting";
  return "live";
}

export function deriveRowState(config: ToolConfig, data?: ToolHealthData): RowState {
  const mode = deriveRowMode(config, data);
  const activeIncidents = mode === "live" ? (data?.activeIncidents?.length ?? 0) : 0;

  if (mode === "no-data") {
    return { mode, mark: "hollow", word: "no public source", tone: "ink", exception: true, activeIncidents };
  }
  if (mode === "pending") {
    return { mode, mark: "hollow", word: "source pending verification", tone: "ink", exception: true, activeIncidents };
  }
  if (mode === "awaiting") {
    return { mode, mark: "hollow", word: "awaiting first poll", tone: "ink", exception: true, activeIncidents };
  }

  switch (data?.status) {
    case "operational":
      // The vendor's word stays "operational" even with an open incident (#63 posture: surface
      // the disagreement, never resolve it by fiat); the mark says an incident is open.
      return activeIncidents > 0
        ? { mode, mark: "hatched", word: "operational", tone: "op", exception: true, activeIncidents }
        : { mode, mark: "solid", word: "operational", tone: "op", exception: false, activeIncidents };
    case "degraded":
      return { mode, mark: "hatched", word: "degraded", tone: "ink", exception: true, activeIncidents };
    case "partial_outage":
      return { mode, mark: "hatched", word: "partial outage", tone: "out", exception: true, activeIncidents };
    case "major_outage":
      return { mode, mark: "hatched", word: "major outage", tone: "out", exception: true, activeIncidents };
    default:
      return { mode, mark: "hollow", word: "unknown", tone: "ink", exception: true, activeIncidents };
  }
}

export type DayTone = "op" | "degrade" | "regress" | "outage" | "unknown";

/**
 * Day tone for the 7-day strip: an incident's impact is authoritative when present; otherwise the
 * worst polled status of the day; with no incident and no sample we have not measured, so we
 * never claim uptime (hollow), unless the history as a whole has samples.
 */
export function dayTone(b: DayBucket, hasSamples: boolean): DayTone {
  switch (b.worstImpact) {
    case "critical":
      return "outage";
    case "major":
      return "regress";
    case "minor":
      return "degrade";
  }
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
  return hasSamples ? "op" : "unknown";
}

export function dayMark(tone: DayTone): Mark {
  if (tone === "op") return "solid";
  if (tone === "unknown") return "hollow";
  return "hatched";
}

export const DAY_TONE_WORD: Record<DayTone, string> = {
  op: "operational",
  degrade: "degraded",
  regress: "partial outage",
  outage: "major outage",
  unknown: "not measured",
};
