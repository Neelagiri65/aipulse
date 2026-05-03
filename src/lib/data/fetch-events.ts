/**
 * Globe-events pipeline. Two phases now:
 *
 *   1. INGEST  — runs on the cron (via /api/ingest). Pulls raw events from
 *                GH Archive (cold-start backfill) and the live Events API,
 *                geocodes authors, probes AI config, writes processed points
 *                to Upstash Redis.
 *
 *   2. READ    — runs on /api/globe-events. Reads the Redis LIST, dedupes,
 *                filters to the 120-min window, returns to the client. Cheap
 *                by design — all expensive work happens at ingest time.
 *
 * Honesty rules (unchanged from prior revisions):
 *   - Events without a geocodable location are dropped, never placed
 *     arbitrarily. Coverage % reported to the UI.
 *   - Repos whose AI-config probe fails render white (no signal), not
 *     guessed teal.
 *   - Archive events carry sourceKind='gharchive'; live-poll events carry
 *     sourceKind='events-api'. Client can label either separately.
 *   - Redis optional — absence falls back to the legacy in-process pipeline
 *     so the globe is never blank just because infra is misconfigured.
 */

import {
  fetchRecentEventsPaged,
  fetchUser,
  probeAIConfig,
  type GitHubEvent,
} from "@/lib/github";
import { geocode } from "@/lib/geocoding";
import { placeFromCoords } from "@/lib/geocoding-places";
import type { GlobePoint } from "@/components/globe/Globe";
import {
  fetchArchiveHour,
  recentArchiveHours,
} from "@/lib/data/gharchive";
import {
  isGlobeStoreAvailable,
  readMeta,
  readWindow,
  writeMeta,
  writePoints,
  type IngestMeta,
  type StoredGlobePoint,
} from "@/lib/data/globe-store";

export type GlobeEventsResult = {
  points: GlobePoint[];
  polledAt: string;
  coverage: {
    eventsReceived: number;
    eventsWithLocation: number;
    locationCoveragePct: number;
    windowSize: number;
    windowAiConfig: number;
    windowMinutes: number;
  };
  failures: Array<{ step: string; message: string }>;
  source: "redis" | "inprocess-fallback";
};

const TEAL = "#2dd4bf";
const WHITE = "#cbd5e1";

const RELEVANT_TYPES = new Set([
  "PushEvent",
  "PullRequestEvent",
  "IssuesEvent",
  "ReleaseEvent",
  "ForkEvent",
  "WatchEvent",
  "CreateEvent",
  "IssueCommentEvent",
  "PullRequestReviewEvent",
]);

const WINDOW_MINUTES = 240;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;
const WINDOW_CAP = 10000;

// Number of Events-API pages to pull per ingest run. 8 pages = ~800 raw
// events. At the *advertised* 5-minute cadence that's ~96 req/hr against
// the 5000/hr auth budget — plenty of headroom. Bumped from 5 because
// GitHub Actions cron routinely skips slots on free tier, so we need
// more volume per successful run to keep the window dense.
const EVENTS_API_PAGES = 8;

// Archive hours pulled on cold-start backfill. Each hour decompresses to
// ~100-150 MB and yields tens of thousands of relevant events. We cap the
// post-dedupe set to POST_DEDUPE_CAP before geocoding (see runIngest),
// so pulling more hours mostly just increases variety — 3 hours is enough
// to seed density without blowing the 60s Vercel timeout on the fetch
// + gunzip + parse step alone.
const ARCHIVE_BACKFILL_HOURS = 3;

// Hard cap on unique events surviving dedupe before the expensive
// geocoding + AI-config probing phase runs. Archive backfill can easily
// produce 50k+ events; at 100-200 unique users per thousand events we
// can't reasonably fetch /users/{login} for all of them in a single
// 60s serverless invocation. Cap to the newest N so coverage is bounded.
const POST_DEDUPE_CAP = 2000;

// Upper bound on concurrent fetchUser / probeAIConfig requests. Vercel's
// serverless runtime can't cope with thousands of parallel sockets — the
// prior uncapped Promise.all produced ~1000 "fetch failed" errors per
// run. 20 is empirically enough to keep a 60s budget busy without
// exhausting the HTTP agent pool.
const MAX_CONCURRENT_REQUESTS = 20;

/**
 * Permanent per-instance cache of AI-config results. Repos rarely toggle
 * tooling, so caching across the process lifetime turns repeat probes into
 * no-ops and keeps us comfortably under the 5000-req/hr budget even with
 * the widened ingest.
 */
const aiConfigCache = new Map<string, boolean>();

/**
 * Per-instance cache of resolved author locations. GitHub profile
 * location rarely changes on human-scale timescales, so caching across
 * the lifetime of a warm serverless instance sharply reduces the
 * fetchUser fan-out on repeat runs. Null-value entries mean "looked up,
 * no geocodable location" — also worth caching so we don't retry.
 */
const userLocationCache = new Map<string, [number, number] | null>();

/**
 * Minimal bounded-concurrency runner. Runs `worker(item)` for every item
 * but never more than `limit` at a time. Returns once all have settled.
 */
async function runBounded<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const spawn = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx]);
    }
  };
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    runners.push(spawn());
  }
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// READ PATH — called by /api/globe-events
// ---------------------------------------------------------------------------

/**
 * Read the last WINDOW_MINUTES of processed events from Redis. If Redis
 * isn't configured or the store is empty, fall back to running one
 * in-process ingest so the caller never sees a blank globe.
 */
export async function fetchGlobeEvents(): Promise<GlobeEventsResult> {
  const polledAt = new Date().toISOString();

  if (!isGlobeStoreAvailable()) {
    return runInProcessFallback(polledAt, "redis not configured");
  }

  const stored = await readWindow(WINDOW_MINUTES);
  if (stored.length === 0) {
    // Empty store — either cold start, or ingest hasn't caught up yet.
    return runInProcessFallback(polledAt, "redis empty");
  }

  const points = stored.map(toGlobePoint);
  const meta = await readMeta();
  const windowAiConfig = stored.reduce(
    (n, p) => n + ((p.meta as { hasAiConfig?: boolean } | undefined)?.hasAiConfig ? 1 : 0),
    0,
  );
  return {
    points,
    polledAt: meta?.lastIngestAt ?? polledAt,
    coverage: {
      eventsReceived: meta?.eventsReceived ?? 0,
      eventsWithLocation: meta?.eventsWithLocation ?? stored.length,
      locationCoveragePct: meta?.locationCoveragePct ?? 0,
      windowSize: stored.length,
      windowAiConfig,
      windowMinutes: WINDOW_MINUTES,
    },
    failures: meta?.failures ?? [],
    source: "redis",
  };
}

async function runInProcessFallback(
  polledAt: string,
  reason: string,
): Promise<GlobeEventsResult> {
  const failures: GlobeEventsResult["failures"] = [
    { step: "store", message: `falling back to in-process ingest (${reason})` },
  ];
  try {
    const processed = await runIngest({ archiveBackfill: false });
    const cutoffMs = Date.now() - WINDOW_MS;
    const windowed = processed.points.filter(
      (p) => Date.parse(p.eventAt) >= cutoffMs,
    );
    return {
      points: windowed.map(toGlobePoint),
      polledAt,
      coverage: {
        eventsReceived: processed.meta.eventsReceived,
        eventsWithLocation: processed.meta.eventsWithLocation,
        locationCoveragePct: processed.meta.locationCoveragePct,
        windowSize: windowed.length,
        windowAiConfig: windowed.reduce(
          (n, p) =>
            n + ((p.meta as { hasAiConfig?: boolean } | undefined)?.hasAiConfig ? 1 : 0),
          0,
        ),
        windowMinutes: WINDOW_MINUTES,
      },
      failures: [...failures, ...processed.meta.failures],
      source: "inprocess-fallback",
    };
  } catch (err) {
    return {
      points: [],
      polledAt,
      coverage: {
        eventsReceived: 0,
        eventsWithLocation: 0,
        locationCoveragePct: 0,
        windowSize: 0,
        windowAiConfig: 0,
        windowMinutes: WINDOW_MINUTES,
      },
      failures: [
        ...failures,
        {
          step: "inprocess-fallback",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
      source: "inprocess-fallback",
    };
  }
}

function toGlobePoint(p: StoredGlobePoint): GlobePoint {
  // Strip the storage-only fields so the client contract is unchanged.
  const { eventAt: _eventAt, eventId: _eventId, sourceKind: _sourceKind, ...pub } = p;
  void _eventAt;
  void _eventId;
  void _sourceKind;
  return pub;
}

// ---------------------------------------------------------------------------
// WRITE PATH — called by /api/ingest (cron)
// ---------------------------------------------------------------------------

export type IngestOptions = {
  /**
   * When true, pulls the last ARCHIVE_BACKFILL_HOURS of gharchive data in
   * addition to the live /events poll. Used on cold start (empty Redis) and
   * occasionally on a manual "refresh" to widen density.
   */
  archiveBackfill?: boolean;
  /** Override the default page count for the live Events API poll. */
  apiPages?: number;
};

export type IngestResult = {
  points: StoredGlobePoint[];
  meta: IngestMeta;
};

/**
 * Run one full ingest pass — fetch raw events, process them into points,
 * and write to Redis (when available). Returns the processed points so
 * the caller can inspect results without a separate read.
 */
export async function runIngest(opts: IngestOptions = {}): Promise<IngestResult> {
  const startedAt = new Date();
  const failures: Array<{ step: string; message: string }> = [];
  const rawEvents: Array<{ event: GitHubEvent; source: "gharchive" | "events-api" }> = [];

  // 1) Archive backfill (optional).
  if (opts.archiveBackfill) {
    const hours = recentArchiveHours(ARCHIVE_BACKFILL_HOURS, startedAt);
    for (const hour of hours) {
      try {
        const events = await fetchArchiveHour(hour);
        for (const e of events) rawEvents.push({ event: e, source: "gharchive" });
      } catch (err) {
        failures.push({
          step: `gharchive:${hour}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 2) Live Events API (always).
  try {
    const pages = opts.apiPages ?? EVENTS_API_PAGES;
    const apiEvents = await fetchRecentEventsPaged(pages);
    for (const e of apiEvents) rawEvents.push({ event: e, source: "events-api" });
  } catch (err) {
    failures.push({
      step: "fetch-events",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // 3) Type-filter + dedupe by event id.
  const byId = new Map<string, { event: GitHubEvent; source: "gharchive" | "events-api" }>();
  for (const r of rawEvents) {
    if (!RELEVANT_TYPES.has(r.event.type)) continue;
    // Live-api takes precedence over archive for the same id (same event,
    // but live has the freshest representation).
    const prev = byId.get(r.event.id);
    if (prev && prev.source === "events-api") continue;
    byId.set(r.event.id, r);
  }
  const eventsReceivedRaw = byId.size;

  // 3b) Cap to the newest POST_DEDUPE_CAP events. Archive backfills
  // easily produce 50k+ events; geocoding every unique actor would blow
  // the serverless timeout and eat into the GH rate budget for no
  // additional UX value (the globe caps at WINDOW_CAP anyway).
  const sortedByRecency = Array.from(byId.values()).sort((a, b) =>
    b.event.created_at.localeCompare(a.event.created_at),
  );
  const capped = sortedByRecency.slice(0, POST_DEDUPE_CAP);
  const cappedById = new Map(capped.map((r) => [r.event.id, r]));
  const eventsReceived = cappedById.size;

  // 4) Geocode unique actors. Bounded concurrency + cross-run cache.
  const uniqueLogins = Array.from(new Set(Array.from(cappedById.values()).map((r) => r.event.actor.login)));
  const locationByLogin = new Map<string, [number, number]>();
  // Seed from cache; only fan out for unknowns.
  const loginsToFetch: string[] = [];
  for (const login of uniqueLogins) {
    const cached = userLocationCache.get(login);
    if (cached === undefined) {
      loginsToFetch.push(login);
    } else if (cached !== null) {
      locationByLogin.set(login, cached);
    }
  }
  await runBounded(loginsToFetch, MAX_CONCURRENT_REQUESTS, async (login) => {
    try {
      const user = await fetchUser(login);
      const coords = geocode(user?.location);
      if (coords) {
        locationByLogin.set(login, coords);
        userLocationCache.set(login, coords);
      } else {
        userLocationCache.set(login, null);
      }
    } catch (err) {
      failures.push({
        step: `fetch-user:${login}`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 5) Keep only placeable events.
  const placeable: Array<{ event: GitHubEvent; source: "gharchive" | "events-api" }> = [];
  for (const r of cappedById.values()) {
    if (locationByLogin.has(r.event.actor.login)) placeable.push(r);
  }

  // 6) Probe AI config for unique repos not already classified. Same
  // bounded-concurrency pattern as the user fetch above.
  const uniqueRepos = Array.from(new Set(placeable.map((r) => r.event.repo.name)));
  const reposToProbe = uniqueRepos.filter((repo) => !aiConfigCache.has(repo));
  await runBounded(reposToProbe, MAX_CONCURRENT_REQUESTS, async (repoFullName) => {
    try {
      const signal = await probeAIConfig(repoFullName);
      aiConfigCache.set(repoFullName, signal.hasAnyConfig);
    } catch (err) {
      failures.push({
        step: `probe-ai-config:${repoFullName}`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 7) Build processed points. Country/region derived from the coord
  //    bbox lookup — same coords are deterministic so no Redis cache
  //    schema change needed; the country attribution is recomputed from
  //    the coords each ingest run. Null country is honest (coord falls
  //    outside every tracked bbox); never substitute a placeholder.
  const points: StoredGlobePoint[] = placeable.map((r) => {
    const coords = locationByLogin.get(r.event.actor.login)!;
    const hasConfig = aiConfigCache.get(r.event.repo.name) === true;
    const place = placeFromCoords(coords[0], coords[1]);
    return {
      lat: coords[0],
      lng: coords[1],
      color: hasConfig ? TEAL : WHITE,
      size: hasConfig ? 0.7 : 0.35,
      eventAt: r.event.created_at,
      eventId: r.event.id,
      sourceKind: r.source,
      meta: {
        eventId: r.event.id,
        type: r.event.type,
        actor: r.event.actor.login,
        repo: r.event.repo.name,
        createdAt: r.event.created_at,
        hasAiConfig: hasConfig,
        sourceKind: r.source,
        country: place?.country ?? null,
        region: place?.region ?? null,
      },
    };
  });

  // Cap storage before writing (WINDOW_CAP is the upper bound per run,
  // distinct from POST_DEDUPE_CAP which bounds pre-geocoding work).
  const storagePoints = points.slice(0, WINDOW_CAP);

  // 8) Write to Redis (no-op if unavailable).
  await writePoints(storagePoints);

  // 9) Meta. eventsReceived reflects the pre-cap raw total so observers
  // can see volume; coverage % is computed against the post-cap working
  // set (that's what got geocoded).
  const meta: IngestMeta = {
    lastIngestAt: startedAt.toISOString(),
    lastIngestSource: opts.archiveBackfill
      ? `gharchive-backfill+events-api(${opts.apiPages ?? EVENTS_API_PAGES}p)`
      : `events-api(${opts.apiPages ?? EVENTS_API_PAGES}p)`,
    eventsReceived: eventsReceivedRaw,
    eventsWithLocation: placeable.length,
    locationCoveragePct:
      eventsReceived > 0
        ? Math.round((placeable.length / eventsReceived) * 100)
        : 0,
    windowSize: storagePoints.length,
    windowAiConfig: storagePoints.reduce(
      (n, p) =>
        n + (p.sourceKind && (p.meta as { hasAiConfig?: boolean } | undefined)?.hasAiConfig ? 1 : 0),
      0,
    ),
    windowMinutes: WINDOW_MINUTES,
    failures,
  };
  await writeMeta(meta);

  return { points: storagePoints, meta };
}
