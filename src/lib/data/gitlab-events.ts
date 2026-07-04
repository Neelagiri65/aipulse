/**
 * GitLab ingestion — universe pulse + tracked projects (PRD
 * prd-tracked-gitlab-projects, zero-breakage plan §5).
 *
 * Two modes, both driven by `data/gitlab-sources.json` and both INERT
 * until that config activates them:
 *   - PULSE: gitlab.com's `/projects?order_by=last_activity_at` is a
 *     global, unauthenticated, seconds-fresh sample of which projects
 *     just had activity (verified 2026-07-05) — the GitHub-firehose
 *     analogue. We take the freshest slice, then fetch each project's
 *     REAL events so every map dot carries a true action + author,
 *     never a fabricated type.
 *   - TRACKED: complete event streams for the curated notables list.
 *
 * Cross-pipeline safety (the whole point of this module's shape):
 *   - Event ids are namespaced `gl:` so GitLab's numeric id space can
 *     never collide with GitHub's in the dedupe map.
 *   - Actor logins are namespaced `gl:{username}` and their coordinates
 *     are resolved HERE via the GitLab users API and handed to the
 *     ingest as pre-seeds — the GitHub users API must never be asked
 *     about a GitLab username (same-name users would attach WRONG geo).
 *   - Repo names are namespaced `gitlab.com/{path}` so the AI-config
 *     cache and display can never conflate a GitLab project with the
 *     same-named GitHub repo (inkscape/inkscape exists on both).
 *   - Every fetch is per-item isolated: total GitLab failure surfaces
 *     as `failures[]` entries and can never fail the ingest run.
 *
 * Trust contract: only real events with a mappable action are emitted;
 * unmapped `action_name`s are DROPPED AND COUNTED, never coerced. Pulse
 * noise filters (mirror namespaces, deletion-scheduled churn) are
 * mechanical pattern rules, disclosed in the registry entry.
 */

import type { GitHubEvent } from "@/lib/github";
import { geocode } from "@/lib/geocoding";
import gitlabConfig from "../../../data/gitlab-sources.json";

const GITLAB_API = "https://gitlab.com/api/v4";

export type GitLabSourcesConfig = {
  pulse: { enabled: boolean; pages: number; sampleProjects: number };
  projects: string[];
};

export type GitLabRawEvent = {
  id: number;
  action_name: string;
  target_type: string | null;
  author?: { username?: string };
  created_at: string;
};

export type GitLabFetchResult = {
  /** GitHub-shaped events, fully namespaced (gl: ids/logins, gitlab.com/ repos). */
  events: GitHubEvent[];
  /** Pre-resolved actor coordinates, keyed by the NAMESPACED login. The
   *  ingest seeds its location cache with these (null = tried, no geo)
   *  so step 4 never consults the GitHub users API for them. */
  locationSeeds: Map<string, [number, number] | null>;
  /** action_name values seen but not mappable — dropped, counted. */
  droppedActions: Record<string, number>;
  failures: Array<{ step: string; message: string }>;
};

export function loadGitLabConfig(): GitLabSourcesConfig {
  const c = gitlabConfig as Partial<GitLabSourcesConfig>;
  return {
    pulse: {
      enabled: c.pulse?.enabled === true,
      pages: Math.max(1, Math.min(3, c.pulse?.pages ?? 1)),
      sampleProjects: Math.max(1, Math.min(30, c.pulse?.sampleProjects ?? 12)),
    },
    projects: Array.isArray(c.projects)
      ? c.projects.filter((p): p is string => typeof p === "string")
      : [],
  };
}

/** Mechanical pulse-noise filters (disclosed in the registry entry):
 *  mirror namespaces double-count our GitHub feed; deletion-scheduled
 *  paths are teardown churn, not activity. Pattern rules only. */
export function isPulseNoise(pathWithNamespace: string): boolean {
  if (/\/mirrors?\//i.test(pathWithNamespace)) return true;
  if (/deletion[_-]scheduled/i.test(pathWithNamespace)) return true;
  return false;
}

/** GitLab action_name → the globe pipeline's event vocabulary. Null =
 *  unmapped → dropped and counted, never coerced into a wrong type. */
export function mapGitLabAction(
  actionName: string,
  targetType: string | null,
): GitHubEvent["type"] | null {
  const a = actionName.toLowerCase();
  if (a.startsWith("pushed")) return "PushEvent";
  if (a === "opened" || a === "accepted") {
    if (targetType === "MergeRequest") return "PullRequestEvent";
    if (targetType === "Issue") return "IssuesEvent";
    return null;
  }
  if (a === "commented on") return "IssueCommentEvent";
  if (a === "created") return "CreateEvent";
  return null;
}

/** One raw GitLab event → a namespaced GitHub-shaped event, or null when
 *  the action is unmapped or the author is missing (no author = no geo =
 *  never placeable; skip early). */
export function toGitHubShape(
  raw: GitLabRawEvent,
  projectPath: string,
): GitHubEvent | null {
  const type = mapGitLabAction(raw.action_name, raw.target_type);
  const username = raw.author?.username;
  if (!type || !username) return null;
  return {
    id: `gl:${raw.id}`,
    type,
    actor: {
      id: 0,
      login: `gl:${username}`,
      avatar_url: "",
      url: `https://gitlab.com/${username}`,
    },
    repo: {
      id: 0,
      name: `gitlab.com/${projectPath}`,
      url: `https://gitlab.com/${projectPath}`,
    },
    created_at: raw.created_at,
  } as unknown as GitHubEvent;
}

type Fetcher = (url: string, token?: string) => Promise<unknown>;

const defaultFetcher: Fetcher = async (url, token) => {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: token
      ? { accept: "application/json", "PRIVATE-TOKEN": token }
      : { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`gitlab ${res.status} for ${url}`);
  return res.json();
};

/** Module-level location cache, mirroring the ingest's GitHub one. */
const gitlabLocationCache = new Map<string, [number, number] | null>();

export async function fetchGitLabEvents(
  config: GitLabSourcesConfig = loadGitLabConfig(),
  fetcher: Fetcher = defaultFetcher,
  eventsPerProject = 20,
): Promise<GitLabFetchResult> {
  const failures: GitLabFetchResult["failures"] = [];
  const droppedActions: Record<string, number> = {};
  const events: GitHubEvent[] = [];
  const locationSeeds = new Map<string, [number, number] | null>();

  // INERT short-circuit: nothing enabled, nothing listed → zero fetches.
  if (!config.pulse.enabled && config.projects.length === 0) {
    return { events, locationSeeds, droppedActions, failures };
  }

  // 1) Assemble the project set: tracked list + pulse sample.
  const projectPaths = new Set(config.projects);
  if (config.pulse.enabled) {
    for (let page = 1; page <= config.pulse.pages; page++) {
      try {
        const rows = (await fetcher(
          `${GITLAB_API}/projects?order_by=last_activity_at&sort=desc&visibility=public&per_page=100&page=${page}`,
        )) as Array<{ path_with_namespace?: string }>;
        for (const row of rows) {
          const path = row.path_with_namespace;
          if (!path || isPulseNoise(path)) continue;
          projectPaths.add(path);
          if (projectPaths.size >= config.projects.length + config.pulse.sampleProjects) break;
        }
      } catch (err) {
        failures.push({
          step: `gitlab-pulse:page-${page}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      if (projectPaths.size >= config.projects.length + config.pulse.sampleProjects) break;
    }
  }

  // 2) Per-project events, isolated.
  await Promise.all(
    Array.from(projectPaths).map(async (path) => {
      try {
        const raw = (await fetcher(
          `${GITLAB_API}/projects/${encodeURIComponent(path)}/events?per_page=${eventsPerProject}`,
        )) as GitLabRawEvent[];
        for (const r of raw) {
          const shaped = toGitHubShape(r, path);
          if (shaped) {
            events.push(shaped);
          } else if (r.action_name) {
            droppedActions[r.action_name] = (droppedActions[r.action_name] ?? 0) + 1;
          }
        }
      } catch (err) {
        failures.push({
          step: `gitlab:${path}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  // 3) Resolve author locations via the GITLAB users API (never GitHub).
  //    The single-user endpoint (/users/{id}) 403s UNAUTHENTICATED on
  //    gitlab.com (anti-scraping) and the /users?username= list omits
  //    `location`, so without a token there is no geo path — skip
  //    entirely rather than emit 403 noise. Verified 2026-07-05.
  //    (Moot for display: GitLab activity is CI/container/bot-dominated,
  //    so dots were never the right representation — see PRD §7.)
  const token = process.env.GITLAB_TOKEN;
  if (!token) {
    return { events, locationSeeds, droppedActions, failures };
  }
  const uniqueLogins = Array.from(new Set(events.map((e) => e.actor.login)));
  await Promise.all(
    uniqueLogins.map(async (namespaced) => {
      const cached = gitlabLocationCache.get(namespaced);
      if (cached !== undefined) {
        locationSeeds.set(namespaced, cached);
        return;
      }
      const username = namespaced.replace(/^gl:/, "");
      try {
        const users = (await fetcher(
          `${GITLAB_API}/users?username=${encodeURIComponent(username)}`,
        )) as Array<{ id?: number }>;
        const id = users[0]?.id;
        let coords: [number, number] | null = null;
        if (id) {
          const profile = (await fetcher(
            `${GITLAB_API}/users/${id}`,
            token,
          )) as { location?: string | null };
          coords = geocode(profile.location ?? null) ?? null;
        }
        gitlabLocationCache.set(namespaced, coords);
        locationSeeds.set(namespaced, coords);
      } catch (err) {
        // No seed entry -> the ingest will also NOT ask GitHub (guarded
        // there by the gl: prefix), so the event is simply unplaceable.
        locationSeeds.set(namespaced, null);
        failures.push({
          step: `gitlab-user:${username}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  return { events, locationSeeds, droppedActions, failures };
}
