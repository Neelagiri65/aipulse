/**
 * 7-day status history — incidents feed + (optional) Redis poll samples.
 *
 * Two data sources are merged to build each tool's daily-bucket sparkline:
 *
 *   1. Historical incidents from the tool's status page `/incidents.json`.
 *      These are authoritative — when an incident exists, the tool WAS
 *      affected. Available for every tool with a Statuspage-shaped endpoint.
 *
 *   2. Poll-time samples stored in Upstash Redis (optional). If
 *      UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set, each poll
 *      pushes one sample per tool; samples refine the sparkline on days
 *      without a public incident (e.g. an OpenAI degradation not yet filed
 *      as an incident would still show as degraded here).
 *
 * Graceful degradation: if Redis is unavailable, sparkline is built from
 * incidents alone. Days with no incident and no sample show as "no data" —
 * explicitly absent rather than silently green.
 */

import { Redis } from "@upstash/redis";
import type {
  ToolHealthStatus,
  ToolIncident,
} from "@/components/health/tools";

// ---------------------------------------------------------------------------
// Types shared with the UI
// ---------------------------------------------------------------------------

export type IncidentImpact = "none" | "minor" | "major" | "critical";

/** Historical record of an incident — richer than the live ToolIncident. */
export type HistoricalIncident = {
  id: string;
  name: string;
  /** Statuspage lifecycle: investigating | identified | monitoring | resolved | postmortem */
  status: string;
  /** none | minor | major | critical */
  impact: IncidentImpact;
  createdAt: string;
  resolvedAt?: string;
  /** Tool slug for downstream consumers that want to link back to the
   *  source status page (e.g. "openai", "anthropic"). Set by aggregators
   *  that fan out across multiple status pages — not populated by
   *  fetchHistoricalIncidents directly, since a single fetch only knows
   *  its own URL/tag, not a logical tool id. */
  toolId?: string;
};

/** One day's worth of uptime data on the sparkline. */
export type DayBucket = {
  /** YYYY-MM-DD (UTC) */
  date: string;
  /** Worst status observed during this day from any source. */
  worstStatus: ToolHealthStatus | "unknown";
  /** Worst impact from any incident that overlapped this day. */
  worstImpact: IncidentImpact;
  /** Incidents that overlapped this day (created_at or resolved_at within). */
  incidents: HistoricalIncident[];
  /** Number of Redis poll samples collected for this day. 0 means no Redis. */
  sampleCount: number;
};

export type StatusSample = {
  /** ISO timestamp. */
  ts: string;
  /** Tool status at that sample. */
  status: ToolHealthStatus;
  /** Count of active incidents at sample time. */
  activeIncidents: number;
};

// ---------------------------------------------------------------------------
// Redis client (lazy; returns null when env vars are absent)
// ---------------------------------------------------------------------------

let cached: Redis | null | undefined;

function redis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return cached;
  }
  cached = new Redis({ url, token });
  return cached;
}

const HISTORY_KEY = (toolId: string) => `aipulse:status-history:${toolId}`;
// 7 days × 24h × 12 samples/hr = 2016. Keep a small margin.
const MAX_SAMPLES = 2100;

export async function recordSample(
  toolId: string,
  sample: StatusSample,
): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    const key = HISTORY_KEY(toolId);
    await r.lpush(key, JSON.stringify(sample));
    await r.ltrim(key, 0, MAX_SAMPLES - 1);
    // 8 days TTL so stale keys don't persist on tools we stop tracking.
    await r.expire(key, 8 * 24 * 3600);
  } catch {
    // Fail closed — history recording never blocks the dashboard.
  }
}

export async function readSamples(toolId: string): Promise<StatusSample[]> {
  const r = redis();
  if (!r) return [];
  try {
    const raw = await r.lrange(HISTORY_KEY(toolId), 0, MAX_SAMPLES - 1);
    const out: StatusSample[] = [];
    for (const entry of raw as unknown[]) {
      const parsed = typeof entry === "string" ? safeParse(entry) : entry;
      if (isSample(parsed)) out.push(parsed);
    }
    return out;
  } catch {
    return [];
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function isSample(v: unknown): v is StatusSample {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.ts === "string" &&
    typeof o.status === "string" &&
    typeof o.activeIncidents === "number"
  );
}

// ---------------------------------------------------------------------------
// Historical incidents fetch
// ---------------------------------------------------------------------------

const REVALIDATE_SECONDS = 300;

type StatuspageIncidentRaw = {
  id: string;
  name: string;
  status: string;
  impact?: IncidentImpact;
  created_at: string;
  resolved_at?: string | null;
  components?: Array<{ id?: string; name?: string }>;
};

export type HistoricalFetchArgs = {
  incidentsApiUrl: string;
  /** data-source id used for Next Data Cache tagging + failure reporting. */
  cacheTag: string;
  /**
   * Optional: only include incidents that reference one of these component
   * names. Case-insensitive exact match. When omitted, all incidents on the
   * page are included.
   */
  componentFilter?: string[];
  /** Window size in days. Defaults to 7. */
  days?: number;
};

export async function fetchHistoricalIncidents(
  args: HistoricalFetchArgs,
): Promise<HistoricalIncident[]> {
  const days = args.days ?? 7;
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    const res = await fetch(args.incidentsApiUrl, {
      next: { revalidate: REVALIDATE_SECONDS, tags: [args.cacheTag] },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { incidents?: StatuspageIncidentRaw[] };
    const raw = json.incidents ?? [];

    const filter = args.componentFilter?.map((s) => s.toLowerCase());

    return raw
      .filter((i) => {
        const created = Date.parse(i.created_at);
        if (Number.isNaN(created) || created < cutoffMs) return false;
        if (!filter) return true;
        const names = (i.components ?? [])
          .map((c) => (c.name ?? "").toLowerCase());
        return names.some((n) => filter.includes(n));
      })
      .map((i) => ({
        id: i.id,
        name: i.name,
        status: i.status,
        impact: i.impact ?? "none",
        createdAt: i.created_at,
        resolvedAt: i.resolved_at ?? undefined,
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Bucketing: merge incidents + samples into 7 daily buckets
// ---------------------------------------------------------------------------

const IMPACT_RANK: Record<IncidentImpact, number> = {
  none: 0,
  minor: 1,
  major: 2,
  critical: 3,
};

const STATUS_RANK: Record<ToolHealthStatus | "unknown", number> = {
  operational: 0,
  unknown: 0,
  degraded: 1,
  partial_outage: 2,
  major_outage: 3,
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function impactToStatus(i: IncidentImpact): ToolHealthStatus | "unknown" {
  switch (i) {
    case "none":
      return "unknown";
    case "minor":
      return "degraded";
    case "major":
      return "partial_outage";
    case "critical":
      return "major_outage";
  }
}

function worstOf<T extends string>(
  a: T,
  b: T,
  rank: Record<T, number>,
): T {
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Build 7-day bucket array. Oldest bucket at index 0, today at index 6.
 * An incident is assigned to every day it overlaps (created_at → resolved_at
 * or now). Samples are bucketed by their own day.
 */
export function bucketToDays(
  incidents: HistoricalIncident[],
  samples: StatusSample[],
  days = 7,
): DayBucket[] {
  const nowMs = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const todayUtc = new Date(isoDate(new Date(nowMs)) + "T00:00:00Z");

  const buckets: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(todayUtc.getTime() - i * msPerDay);
    buckets.push({
      date: isoDate(dayStart),
      worstStatus: "unknown",
      worstImpact: "none",
      incidents: [],
      sampleCount: 0,
    });
  }

  const firstDayStartMs = new Date(buckets[0].date + "T00:00:00Z").getTime();
  const lastDayEndMs = new Date(buckets[buckets.length - 1].date + "T00:00:00Z").getTime() + msPerDay;

  // Apply incidents (overlap each day they span)
  for (const inc of incidents) {
    const startMs = Date.parse(inc.createdAt);
    if (Number.isNaN(startMs)) continue;
    const endMs = inc.resolvedAt ? Date.parse(inc.resolvedAt) : nowMs;
    // Clamp to window
    const overlapStart = Math.max(startMs, firstDayStartMs);
    const overlapEnd = Math.min(endMs, lastDayEndMs);
    if (overlapEnd < overlapStart) continue;
    for (const b of buckets) {
      const bStart = new Date(b.date + "T00:00:00Z").getTime();
      const bEnd = bStart + msPerDay;
      if (overlapEnd < bStart || overlapStart >= bEnd) continue;
      b.incidents.push(inc);
      b.worstImpact = worstOf(b.worstImpact, inc.impact, IMPACT_RANK);
      b.worstStatus = worstOf(
        b.worstStatus,
        impactToStatus(inc.impact),
        STATUS_RANK,
      );
    }
  }

  // Apply Redis samples (refine the non-incident days)
  for (const s of samples) {
    const ts = Date.parse(s.ts);
    if (Number.isNaN(ts)) continue;
    if (ts < firstDayStartMs || ts >= lastDayEndMs) continue;
    const date = isoDate(new Date(ts));
    const b = buckets.find((x) => x.date === date);
    if (!b) continue;
    b.sampleCount += 1;
    if (STATUS_RANK[s.status] > STATUS_RANK[b.worstStatus]) {
      b.worstStatus = s.status;
    }
    // If incident already marked the day as bad, don't override incident impact
    // from samples — incidents are the authoritative record.
  }

  return buckets;
}

export function hasRedisConfigured(): boolean {
  return redis() !== null;
}
