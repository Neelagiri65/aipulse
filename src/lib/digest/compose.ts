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
import type { DigestBody, DigestMode, DigestSection } from "@/lib/digest/types";
import { composeHnSection } from "@/lib/digest/sections/hn";
import { composeToolHealthSection } from "@/lib/digest/sections/tool-health";
import { composeBenchmarksSection } from "@/lib/digest/sections/benchmarks";
import { composeSdkAdoptionSection } from "@/lib/digest/sections/sdk-adoption";
import { composeLabsSection } from "@/lib/digest/sections/labs";
import { detectEmptyDay } from "@/lib/digest/empty-day";

const GREETING_TEMPLATE = "Good morning from AI Pulse — here's what moved in {geoCountry} and beyond in the last 24h.";
const GREETING_TEMPLATE_QUIET = "Good morning from AI Pulse — all quiet in the AI ecosystem in {geoCountry} and beyond.";
const GREETING_TEMPLATE_BOOTSTRAP = "Welcome to AI Pulse. Here's where the AI ecosystem stands right now, as seen from {geoCountry}.";

export type ComposeDigestInput = {
  today: DailySnapshot;
  yesterday: DailySnapshot | null;
  hn: HnWireResult;
  incidents24h: HistoricalIncident[];
  now: Date;
};

export function composeDigest(input: ComposeDigestInput): DigestBody {
  const { today, yesterday, hn, incidents24h, now } = input;

  const toolHealth = composeToolHealthSection({
    todayTools: today.tools,
    yesterdayTools: yesterday?.tools ?? null,
    incidents24h,
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

  const sections: DigestSection[] = [
    toolHealth,
    hnSection,
    benchmarks,
    sdkAdoption,
    labs,
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

  return {
    date: today.date,
    subject,
    mode,
    greetingTemplate,
    sections,
    generatedAt: now.toISOString(),
  };
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
    return `AI Pulse — ${date} · where things stand`;
  }
  if (mode === "quiet") {
    return `AI Pulse — ${date} · all quiet in the AI ecosystem`;
  }
  const hook = pickLeadHook(sections, incidentCount24h);
  return hook ? `AI Pulse — ${date} · ${hook}` : `AI Pulse — ${date}`;
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
  return null;
}
