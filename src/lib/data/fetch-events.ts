/**
 * Globe-events pipeline. Takes raw GitHub Events → resolves author
 * locations via profile lookup → geocodes → probes the repo for AI
 * config files → emits GlobePoint[] with a coverage summary.
 *
 * Honesty rules:
 *   - Events without a geocodable location are dropped, not placed
 *     arbitrarily. Coverage % is reported to the UI.
 *   - Repos whose AI config probe fails are rendered white (no signal),
 *     not guessed teal.
 *   - All fetches are cached via Next's Data Cache; rate budget is
 *     comfortably under 5000/hr after warm-up.
 */

import {
  fetchRecentEvents,
  fetchUser,
  probeAIConfig,
  type GitHubEvent,
} from "@/lib/github";
import { geocode } from "@/lib/geocoding";
import type { GlobePoint } from "@/components/globe/Globe";

export type GlobeEventsResult = {
  points: GlobePoint[];
  /** ISO of this server-side poll. */
  polledAt: string;
  /** Coverage diagnostics — displayed to the user honestly. */
  coverage: {
    /** Events received on the most recent poll (before filtering). */
    eventsReceived: number;
    /** Placeable events added on the most recent poll (net of dedupe). */
    eventsWithLocation: number;
    /** % of the most recent poll's events that were placeable. */
    locationCoveragePct: number;
    /** Total placeable events in the accumulated window. */
    windowSize: number;
    /** Events in the window with AI-tool config files detected. */
    windowAiConfig: number;
    /** Window length in minutes (accumulator horizon). */
    windowMinutes: number;
  };
  failures: Array<{ step: string; message: string }>;
};

const TEAL = "#2dd4bf"; // AI-config detected
const WHITE = "#cbd5e1"; // no AI config — soft slate, not harsh pure white

/**
 * Only consider event types that plausibly indicate active coding work.
 * Stars and forks are excluded as they spam the globe without signal.
 */
const RELEVANT_TYPES = new Set([
  "PushEvent",
  "PullRequestEvent",
  "IssuesEvent",
  "ReleaseEvent",
]);

const WINDOW_MINUTES = 60;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;
const WINDOW_CAP = 5000; // hard upper bound to prevent runaway memory

type CachedPoint = GlobePoint & { firstSeenAt: number };

/**
 * Module-scoped rolling window. Survives across requests within one warm
 * Node serverless instance. Each instance has its own cache — that's fine:
 * the Globe shows a dense recent view from whichever instance the client
 * hits. Single-threaded JS guarantees no concurrent-write races.
 */
const eventCache = new Map<string, CachedPoint>();

/**
 * Permanent per-instance cache of AI-config status, keyed by "owner/repo".
 * Repos rarely toggle AI tooling, so caching until process death is a
 * correctness-preserving speedup — and it means the Contents API probe is
 * only paid once per repo per warm instance, not once per 24h. This is the
 * big unblock for globe density: we stop re-probing repos we've already
 * classified, so the probing phase becomes near-free after warm-up.
 */
const aiConfigCache = new Map<string, boolean>();

function pruneAndCap(now: number) {
  for (const [id, entry] of eventCache) {
    if (now - entry.firstSeenAt > WINDOW_MS) eventCache.delete(id);
  }
  if (eventCache.size > WINDOW_CAP) {
    // Evict oldest until under cap.
    const sorted = Array.from(eventCache.entries()).sort(
      (a, b) => a[1].firstSeenAt - b[1].firstSeenAt,
    );
    const toRemove = sorted.length - WINDOW_CAP;
    for (let i = 0; i < toRemove; i++) eventCache.delete(sorted[i][0]);
  }
}

export async function fetchGlobeEvents(): Promise<GlobeEventsResult> {
  const polledAt = new Date().toISOString();
  const now = Date.now();
  const failures: GlobeEventsResult["failures"] = [];

  // Prune stale entries even if the upstream fetch fails — the window should
  // never show points older than WINDOW_MINUTES regardless of poll health.
  pruneAndCap(now);

  let events: GitHubEvent[];
  try {
    events = await fetchRecentEvents();
  } catch (err) {
    failures.push({
      step: "fetch-events",
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      points: cachedPointsArray(),
      polledAt,
      coverage: {
        eventsReceived: 0,
        eventsWithLocation: 0,
        locationCoveragePct: 0,
        windowSize: eventCache.size,
        windowAiConfig: countAiConfigInCache(),
        windowMinutes: WINDOW_MINUTES,
      },
      failures,
    };
  }

  const relevant = events.filter((e) => RELEVANT_TYPES.has(e.type));
  const eventsReceived = relevant.length;

  // Resolve author locations (deduped — cached 7 days per login so repeat
  // authors hit cache).
  const uniqueLogins = Array.from(new Set(relevant.map((e) => e.actor.login)));
  const locationByLogin = new Map<string, [number, number]>();
  await Promise.all(
    uniqueLogins.map(async (login) => {
      try {
        const user = await fetchUser(login);
        const coords = geocode(user?.location);
        if (coords) locationByLogin.set(login, coords);
      } catch (err) {
        failures.push({
          step: `fetch-user:${login}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  // Filter to events we can place on the globe.
  const placeable = relevant.filter((e) => locationByLogin.has(e.actor.login));

  // Probe AI config for unique repos we haven't classified yet. Any repo
  // already in aiConfigCache is skipped entirely — that's the unblock that
  // lets polling stay cheap as the cache fills.
  const uniqueRepos = Array.from(new Set(placeable.map((e) => e.repo.name)));
  const reposToProbe = uniqueRepos.filter((r) => !aiConfigCache.has(r));
  await Promise.all(
    reposToProbe.map(async (repoFullName) => {
      try {
        const signal = await probeAIConfig(repoFullName);
        aiConfigCache.set(repoFullName, signal.hasAnyConfig);
      } catch (err) {
        // Don't poison the cache on a transient probe failure — leave the
        // entry unset so the next poll retries. The event still gets emitted
        // as white below; if the repo is truly AI-configured, a later probe
        // will upgrade it via the backfill pass.
        failures.push({
          step: `probe-ai-config:${repoFullName}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  // Build globe points from this poll and merge into the rolling cache.
  // Repos whose probe hasn't resolved yet (failed, or brand new) render white;
  // the backfill pass below recolours them once the cache catches up.
  let newThisPoll = 0;
  for (const event of placeable) {
    if (eventCache.has(event.id)) continue;
    const coords = locationByLogin.get(event.actor.login)!;
    const hasConfig = aiConfigCache.get(event.repo.name) === true;
    eventCache.set(event.id, {
      lat: coords[0],
      lng: coords[1],
      color: hasConfig ? TEAL : WHITE,
      size: hasConfig ? 0.7 : 0.35,
      firstSeenAt: now,
      meta: {
        eventId: event.id,
        type: event.type,
        actor: event.actor.login,
        repo: event.repo.name,
        createdAt: event.created_at,
        hasAiConfig: hasConfig,
      },
    });
    newThisPoll++;
  }

  // Backfill: recolour any cached point whose repo has since been classified
  // as AI-configured. Covers (a) events emitted before their probe resolved,
  // (b) repos that 403'd on one poll and succeeded on a later one.
  for (const [id, point] of eventCache) {
    const repo = (point.meta as { repo?: string } | undefined)?.repo;
    if (!repo) continue;
    if (aiConfigCache.get(repo) !== true) continue;
    if (point.color === TEAL) continue;
    eventCache.set(id, {
      ...point,
      color: TEAL,
      size: 0.7,
      meta: { ...(point.meta ?? {}), hasAiConfig: true },
    });
  }

  pruneAndCap(now);

  const points = cachedPointsArray();
  const coverage = {
    eventsReceived,
    eventsWithLocation: placeable.length,
    locationCoveragePct:
      eventsReceived > 0
        ? Math.round((placeable.length / eventsReceived) * 100)
        : 0,
    windowSize: eventCache.size,
    windowAiConfig: countAiConfigInCache(),
    windowMinutes: WINDOW_MINUTES,
  };

  // Surface a signal if this poll added zero new placeable events AND the
  // cache is empty — useful for noticing the geocoder is starving.
  if (newThisPoll === 0 && eventCache.size === 0 && eventsReceived > 0) {
    failures.push({
      step: "coverage",
      message: `poll returned ${eventsReceived} relevant events but none were placeable (geocoder miss)`,
    });
  }

  return { points, polledAt, coverage, failures };
}

function cachedPointsArray(): GlobePoint[] {
  return Array.from(eventCache.values()).map(({ firstSeenAt: _ignored, ...p }) => {
    void _ignored;
    return p;
  });
}

function countAiConfigInCache(): number {
  let n = 0;
  for (const p of eventCache.values()) {
    if ((p.meta as { hasAiConfig?: boolean } | undefined)?.hasAiConfig) n++;
  }
  return n;
}
