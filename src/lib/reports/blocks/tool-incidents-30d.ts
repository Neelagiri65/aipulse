/**
 * Genesis Report block — tool incident counts over a window.
 *
 * Pure transform over the existing daily snapshots. For each tool
 * tracked in the snapshot history, counts the number of UTC days
 * within the window where `activeIncidents > 0` AND the cumulative
 * "incident-days" exposure. Sorts by total exposure descending,
 * takes top-N.
 *
 * "Incident-days" not "incident count" because the per-day snapshot
 * doesn't carry start/end timestamps — only the activeIncidents
 * count at the moment of capture (04:00 UTC daily). A tool with
 * activeIncidents=2 every day for a week registers as 14 incident-
 * days; a tool with activeIncidents=5 on a single day registers as
 * 5. The framing "tool with the most incident-days this window" is
 * the honest reading of what the data supports.
 *
 * Trust contract:
 *   - Every row's value is computed from the snapshot store.
 *     activeIncidents is sourced from the upstream status pages
 *     (Anthropic / OpenAI / Vercel / Cloudflare / etc.).
 *   - sourceUrl is the public status page; sourceLabel = hostname.
 *   - When < 2 snapshots exist OR no tool had any incident in the
 *     window, returns rows: [] (honest empty, no fabrication).
 *
 * Pure: no IO, no clock reads (callers pass `now`).
 */

import type { GenesisBlockResult, GenesisBlockRow } from "@/lib/reports/types";
import type { DailySnapshot } from "@/lib/data/snapshot";

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_TOP_N = 5;

/** Per-tool status-page URL. Mirrors the canonical tool ids the
 *  snapshot writer uses today. New tools get a NULL entry; the
 *  block falls back to a placeholder source label so the row
 *  still ships. */
const STATUS_PAGE_URL: Record<string, { url: string; label: string }> = {
  anthropic: { url: "https://status.anthropic.com", label: "status.anthropic.com" },
  openai: { url: "https://status.openai.com", label: "status.openai.com" },
  "openai-codex": {
    url: "https://status.openai.com",
    label: "status.openai.com",
  },
  windsurf: { url: "https://status.windsurf.com", label: "status.windsurf.com" },
  copilot: {
    url: "https://www.githubstatus.com",
    label: "githubstatus.com",
  },
  vercel: { url: "https://www.vercel-status.com", label: "vercel-status.com" },
  supabase: { url: "https://status.supabase.com", label: "status.supabase.com" },
  cloudflare: {
    url: "https://www.cloudflarestatus.com",
    label: "cloudflarestatus.com",
  },
  upstash: { url: "https://status.upstash.com", label: "status.upstash.com" },
};

export type ToolIncidentsBlockInput = {
  snapshots: DailySnapshot[];
  windowDays?: number;
  topN?: number;
  now?: () => Date;
};

export function loadToolIncidents30dBlock(
  input: ToolIncidentsBlockInput,
): GenesisBlockResult {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const topN = input.topN ?? DEFAULT_TOP_N;
  const now = (input.now ?? (() => new Date()))();

  const cutoffMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = input.snapshots.filter(
    (s) => Date.parse(s.capturedAt) >= cutoffMs,
  );

  if (inWindow.length === 0) {
    // Bootstrap-mode is reader-facing too — the empty section needs
    // to explain why it's empty without leaking ops-internal framing.
    return {
      rows: [],
      generatedAt: now.toISOString(),
      sanityWarnings: [],
      caveats: [
        `No daily snapshots captured in the trailing ${windowDays}-day window yet.`,
      ],
    };
  }

  // Aggregate incident-days per tool id.
  const incidentDays = new Map<string, number>();
  const seenIds = new Set<string>();
  for (const snap of inWindow) {
    for (const tool of snap.tools) {
      seenIds.add(tool.id);
      if (tool.activeIncidents > 0) {
        incidentDays.set(
          tool.id,
          (incidentDays.get(tool.id) ?? 0) + tool.activeIncidents,
        );
      }
    }
  }

  const candidates = Array.from(incidentDays.entries())
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const rows: GenesisBlockRow[] = candidates.map(([id, days]) => {
    const src = STATUS_PAGE_URL[id] ?? {
      url: `https://gawk.dev/sources`,
      label: "Gawk sources",
    };
    return {
      label: id,
      value: `${days} incident-${days === 1 ? "day" : "days"}`,
      sourceUrl: src.url,
      sourceLabel: src.label,
    };
  });

  // S62g: the partial-snapshot disclosure is reader-facing — the
  // reader needs it to read the incident-days numbers honestly. Lives
  // in `caveats[]`, not `sanityWarnings[]`. (See `GenesisBlockResult`
  // type doc for the two-channel disclosure rationale.)
  const caveats: string[] = [];
  if (inWindow.length < windowDays / 2) {
    caveats.push(
      `Based on ${inWindow.length} days of captured snapshots — represents a minimum, not a complete count.`,
    );
  }

  return {
    rows,
    generatedAt: now.toISOString(),
    sanityWarnings: [],
    caveats,
  };
}
