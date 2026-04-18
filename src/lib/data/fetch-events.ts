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
    eventsReceived: number;
    eventsWithLocation: number;
    eventsWithAiConfig: number;
    /** Percentage of received events that were placeable on the globe. */
    locationCoveragePct: number;
  };
  failures: Array<{ step: string; message: string }>;
};

const TEAL = "#2dd4bf"; // AI-config detected
const WHITE = "#ffffff"; // no AI config

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

export async function fetchGlobeEvents(): Promise<GlobeEventsResult> {
  const polledAt = new Date().toISOString();
  const failures: GlobeEventsResult["failures"] = [];

  let events: GitHubEvent[];
  try {
    events = await fetchRecentEvents();
  } catch (err) {
    failures.push({
      step: "fetch-events",
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      points: [],
      polledAt,
      coverage: {
        eventsReceived: 0,
        eventsWithLocation: 0,
        eventsWithAiConfig: 0,
        locationCoveragePct: 0,
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

  // Probe AI config for each UNIQUE repo among placeable events (cached 24h
  // per path per repo).
  const uniqueRepos = Array.from(new Set(placeable.map((e) => e.repo.name)));
  const configByRepo = new Map<string, boolean>();
  await Promise.all(
    uniqueRepos.map(async (repoFullName) => {
      try {
        const signal = await probeAIConfig(repoFullName);
        configByRepo.set(repoFullName, signal.hasAnyConfig);
      } catch (err) {
        failures.push({
          step: `probe-ai-config:${repoFullName}`,
          message: err instanceof Error ? err.message : String(err),
        });
        configByRepo.set(repoFullName, false);
      }
    }),
  );

  // Build globe points.
  let eventsWithAiConfig = 0;
  const points: GlobePoint[] = placeable.map((event) => {
    const coords = locationByLogin.get(event.actor.login)!;
    const hasConfig = configByRepo.get(event.repo.name) === true;
    if (hasConfig) eventsWithAiConfig++;
    return {
      lat: coords[0],
      lng: coords[1],
      color: hasConfig ? TEAL : WHITE,
      size: hasConfig ? 0.8 : 0.5,
      meta: {
        eventId: event.id,
        type: event.type,
        actor: event.actor.login,
        repo: event.repo.name,
        createdAt: event.created_at,
        hasAiConfig: hasConfig,
      },
    };
  });

  const coverage = {
    eventsReceived,
    eventsWithLocation: placeable.length,
    eventsWithAiConfig,
    locationCoveragePct:
      eventsReceived > 0
        ? Math.round((placeable.length / eventsReceived) * 100)
        : 0,
  };

  return { points, polledAt, coverage, failures };
}
