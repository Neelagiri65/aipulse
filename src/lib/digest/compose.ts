/**
 * Top-level digest composer.
 *
 * Pure function. Takes today's snapshot, yesterday's snapshot (or null on
 * Day 1), the current HN wire, and the 24h incidents list, and returns a
 * `DigestBody` ready to render into an email, the `/digest/{date}` page,
 * or the admin preview.
 *
 * Body-mode selection:
 *   - `yesterday === null` → "bootstrap" (first-digest / snapshot-light).
 *   - `detectEmptyDay` true → "quiet".
 *   - otherwise → "diff".
 *
 * HN is always included but never alone flips the body mode — a purely
 * HN-carrying digest with no tracked movement is still "quiet" and will
 * use the "All quiet in the AI ecosystem" headline.
 */

import type { DailySnapshot } from "@/lib/data/snapshot";
import type { HnWireResult } from "@/lib/data/wire-hn";
import type { HistoricalIncident } from "@/lib/data/status-history";
import type { ModelUsageSnapshotRow } from "@/lib/data/openrouter-types";
import type { DigestBody, DigestMode, DigestSection } from "@/lib/digest/types";
import { composeHnSection } from "@/lib/digest/sections/hn";
import { composeToolHealthSection } from "@/lib/digest/sections/tool-health";
import { composeBenchmarksSection } from "@/lib/digest/sections/benchmarks";
import { composeSdkAdoptionSection } from "@/lib/digest/sections/sdk-adoption";
import { composeLabsSection } from "@/lib/digest/sections/labs";
import { composeModelUsageSection } from "@/lib/digest/sections/model-usage";
import { detectEmptyDay } from "@/lib/digest/empty-day";

// Diff-mode greeting is unused at render time — the template prints
// `tldr` instead — but kept populated for archive re-rendering and as a
// fallback when no diff content surfaces.
const GREETING_TEMPLATE = "Good morning from Gawk — here's what moved in {geoCountry} in the last 24h.";
const GREETING_TEMPLATE_QUIET = "Good morning from Gawk — all quiet in the AI ecosystem in {geoCountry}.";
const GREETING_TEMPLATE_BOOTSTRAP = "Welcome to Gawk. Here's where the AI ecosystem stands right now, as seen from {geoCountry}.";

export type ComposeDigestInput = {
  today: DailySnapshot;
  yesterday: DailySnapshot | null;
  hn: HnWireResult;
  incidents24h: HistoricalIncident[];
  /** Count of incidents in the prior 24h window (24-48h ago). When
   *  omitted, tool-health renders without the "(vs N yesterday)"
   *  baseline. */
  priorIncidentCount?: number;
  now: Date;
  /**
   * OpenRouter snapshot history (date → top-N slugs). Optional —
   * omit on existing call sites until the snapshot reader lands;
   * the section composer self-gates on ≥7 days so passing fewer
   * silently drops the section.
   */
  modelUsageSnapshots?: Record<string, ModelUsageSnapshotRow>;
};

export function composeDigest(input: ComposeDigestInput): DigestBody {
  const { today, yesterday, hn, incidents24h, priorIncidentCount, now } = input;

  const toolHealth = composeToolHealthSection({
    todayTools: today.tools,
    yesterdayTools: yesterday?.tools ?? null,
    incidents24h,
    priorIncidentCount,
  });

  const hnSection = composeHnSection({ hn });

  const benchmarks = composeBenchmarksSection({
    today: today.benchmarks,
    yesterday: yesterday?.benchmarks ?? null,
  });

  const sdkAdoption = composeSdkAdoptionSection({
    today: today.packages,
    yesterday: yesterday?.packages ?? null,
  });

  const labs = composeLabsSection({
    today: today.labs24h,
    yesterday: yesterday?.labs24h ?? null,
  });

  const modelUsage = input.modelUsageSnapshots
    ? composeModelUsageSection({
        snapshots: input.modelUsageSnapshots,
        today: today.date,
      })
    : null;

  // Lead with the strongest, most-defensible content (benchmarks: real
  // deltas with primary-source provenance), then operational signal
  // (tool health), then community discussion (HN). Subject-line lookup
  // (`pickLeadHook`) keys on section.id, not array index, so reordering
  // here is safe.
  const sections: DigestSection[] = [
    benchmarks,
    toolHealth,
    hnSection,
    sdkAdoption,
    labs,
    ...(modelUsage ? [modelUsage] : []),
  ];

  const mode = selectBodyMode({
    isBootstrap: yesterday === null,
    sections,
    incidentCount24h: incidents24h.length,
  });

  const subject = buildSubject(mode, today.date, sections, incidents24h.length);
  const greetingTemplate =
    mode === "bootstrap"
      ? GREETING_TEMPLATE_BOOTSTRAP
      : mode === "quiet"
        ? GREETING_TEMPLATE_QUIET
        : GREETING_TEMPLATE;
  const tldr =
    mode === "diff" ? buildTldr(sections, incidents24h.length) : undefined;

  return {
    date: today.date,
    subject,
    mode,
    greetingTemplate,
    tldr,
    sections,
    generatedAt: now.toISOString(),
  };
}

/** Diff-mode TL;DR: "1 tool incident · 5 HN stories · 4 benchmark movers".
 *  Includes any populated section that would be visually obvious to the
 *  reader as "movement". Only sections with items are listed; tool
 *  incidents come from the raw count (not section.items length, which
 *  also includes status transitions and current-state tiles). */
function buildTldr(
  sections: DigestSection[],
  incidentCount24h: number,
): string | undefined {
  const parts: string[] = [];
  if (incidentCount24h > 0) {
    parts.push(
      `${incidentCount24h} tool incident${incidentCount24h === 1 ? "" : "s"}`,
    );
  }
  const benchmarks = sections.find((s) => s.id === "benchmarks");
  if (benchmarks && benchmarks.mode === "diff" && benchmarks.items.length > 0) {
    parts.push(
      `${benchmarks.items.length} benchmark mover${benchmarks.items.length === 1 ? "" : "s"}`,
    );
  }
  const sdk = sections.find((s) => s.id === "sdk-adoption");
  if (sdk && sdk.mode === "diff" && sdk.items.length > 0) {
    parts.push(
      `${sdk.items.length} SDK shift${sdk.items.length === 1 ? "" : "s"}`,
    );
  }
  const labs = sections.find((s) => s.id === "labs");
  if (labs && labs.mode === "diff" && labs.items.length > 0) {
    parts.push(
      `${labs.items.length} lab update${labs.items.length === 1 ? "" : "s"}`,
    );
  }
  const hn = sections.find((s) => s.id === "hn");
  if (hn && hn.items.length > 0) {
    parts.push(
      `${hn.items.length} HN ${hn.items.length === 1 ? "story" : "stories"}`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function selectBodyMode(input: {
  isBootstrap: boolean;
  sections: DigestSection[];
  incidentCount24h: number;
}): DigestMode {
  if (input.isBootstrap) return "bootstrap";
  const quiet = detectEmptyDay({
    sections: input.sections,
    incidentCount24h: input.incidentCount24h,
  });
  return quiet ? "quiet" : "diff";
}

function buildSubject(
  mode: DigestMode,
  date: string,
  sections: DigestSection[],
  incidentCount24h: number,
): string {
  if (mode === "bootstrap") {
    return `Gawk — ${date} · where things stand`;
  }
  if (mode === "quiet") {
    return `Gawk — ${date} · all quiet in the AI ecosystem`;
  }
  const hook = pickLeadHook(sections, incidentCount24h);
  return hook ? `Gawk — ${date} · ${hook}` : `Gawk — ${date}`;
}

/** Choose the most newsworthy hook from today's sections for the subject
 *  line. Priority: incidents > benchmark rank changes > lab movement >
 *  SDK shifts. HN is excluded — it's always-on and not decision-relevant
 *  for the subject line. */
function pickLeadHook(
  sections: DigestSection[],
  incidentCount24h: number,
): string | null {
  if (incidentCount24h > 0) {
    return `${incidentCount24h} tool incident${incidentCount24h === 1 ? "" : "s"}`;
  }
  const benchmarks = sections.find((s) => s.id === "benchmarks");
  if (benchmarks && benchmarks.mode === "diff") return benchmarks.headline;
  const labs = sections.find((s) => s.id === "labs");
  if (labs && labs.mode === "diff") return labs.headline;
  const sdk = sections.find((s) => s.id === "sdk-adoption");
  if (sdk && sdk.mode === "diff") return sdk.headline;
  const modelUsage = sections.find((s) => s.id === "model-usage");
  if (modelUsage && modelUsage.mode === "diff") return modelUsage.headline;
  return null;
}
