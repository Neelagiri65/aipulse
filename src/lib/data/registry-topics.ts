/**
 * Registry discovery via GitHub Topics — source #3 of the discovery
 * pipeline.
 *
 * Why this exists: Code Search (`search/code`) is capped at 1000 results
 * per query AND returns results only from repos the token owner has
 * code-search access to. Topic search (`search/repositories?q=topic:X`)
 * hits a *different* index, returns repo-level metadata directly (so we
 * skip the fetchRepoMeta round-trip for every candidate), and surfaces
 * self-identified AI projects that may not carry the canonical config
 * filename — but often do.
 *
 * Pipeline per run:
 *   1. For each topic in TOPICS, hit /search/repositories with
 *      `topic:<name>`, sort=stars, per_page=100, pages=2 by default.
 *      Repos already carry stars/language/description/pushed_at in the
 *      response.
 *   2. Dedupe by full_name across topics (a repo tagged `claude` +
 *      `llm` should only probe once).
 *   3. Skip repos already in the registry.
 *   4. For each candidate (bounded by `cap`):
 *        a. Probe all six ConfigKind paths via pathExists. Cached for
 *           30 days by the Next.js Data Cache; repeat probes cost zero.
 *        b. Verify any existing paths with the same deterministic
 *           shape verifier used elsewhere.
 *        c. Resolve owner location through the shared cache.
 *   5. Upsert verified entries via the shared registry path. firstSeen
 *      + location are preserved on re-discovery.
 *
 * Trust contract:
 *   - Topic tags are *self-declared* by repo owners; they are a
 *     candidate signal only. No entry reaches the registry without
 *     passing the same shape verifier as Code Search discovery.
 *   - `lastActivity` comes from the search response's pushed_at field
 *     (same shape as the /repos/{owner}/{repo} endpoint would return)
 *     — not synthesised.
 *
 * Rate budget per run (cap=60, 7 topics × 2 pages = 14 search calls):
 *   - Search: 14 calls. At 30/min authenticated budget, ~30s at max
 *     burst with 2s inter-call delay.
 *   - Contents probes: 6 × 60 = 360 calls (mostly cached after first
 *     backfill).
 *   - Verifier: ≤120 calls (≤2 present paths per repo on average).
 *   - Owner location: ≤60 calls via the shared resolver cache.
 *   - Worst case ~550 fresh GH calls; well inside the 5000/hr budget.
 */

import { CONFIG_PATHS, type ConfigKind } from "./registry-shared";
import {
  isRegistryAvailable,
  readAllEntries,
  upsertEntries,
  writeMeta,
  type DetectedConfig,
  type RegistryEntry,
  type RegistryMeta,
} from "./repo-registry";
import { verifyConfigFile } from "./config-verifier";
import { resolveOwnerLocation } from "./owner-location";
import { pathExists } from "../github";

type Failure = { step: string; message: string };

/**
 * Topic list — self-declared AI-tool / AI-framework identifiers.
 * Ordered roughly by expected signal density (claude, cursor, copilot,
 * aider, windsurf are tightly coupled to the config files we verify;
 * llm/ai-agent/langchain/crewai cast a wider net).
 */
export const TOPICS: readonly string[] = [
  "claude",
  "cursor",
  "ai-coding",
  "copilot",
  "aider",
  "windsurf",
  "ai-agent",
  "llm",
  "langchain",
  "crewai",
  "agents-md",
] as const;

const ALL_KINDS: ConfigKind[] = Object.keys(CONFIG_PATHS) as ConfigKind[];

export type TopicsDiscoverOptions = {
  /** Topics to sweep this run. Defaults to the full TOPICS list. */
  topics?: readonly string[];
  /** Pages per topic (1-10). Default 2 → up to 200 repos per topic. */
  pagesPerTopic?: number;
  /** Max verifications per run. Default 60, hard cap 200. */
  cap?: number;
  /** Label written to RegistryMeta.lastDiscoverySource. */
  source: string;
};

export type TopicsDiscoverResult = {
  topicsSwept: number;
  candidatesFound: number;
  candidatesAfterDedupe: number;
  candidatesAfterSkipKnown: number;
  verifiesAttempted: number;
  written: number;
  failures: Failure[];
};

type TopicCandidate = {
  fullName: string;
  owner: string;
  name: string;
  stars?: number;
  language?: string | null;
  description?: string | null;
  pushed_at?: string;
  /** Topic(s) the repo was matched on — used for debugging only. */
  topics: string[];
};

export async function runTopicsDiscovery(
  opts: TopicsDiscoverOptions,
): Promise<TopicsDiscoverResult> {
  const failures: Failure[] = [];
  const topics = opts.topics ?? TOPICS;
  const pagesPerTopic = Math.max(1, Math.min(10, opts.pagesPerTopic ?? 2));
  const cap = Math.max(1, Math.min(200, opts.cap ?? 60));

  if (!isRegistryAvailable()) {
    failures.push({
      step: "availability",
      message: "Upstash Redis not configured — topics discovery skipped",
    });
    return emptyResult(failures);
  }

  const token = process.env.GH_TOKEN;
  if (!token) {
    failures.push({
      step: "auth",
      message: "GH_TOKEN not set — cannot hit Search API at 30 req/min",
    });
    return emptyResult(failures);
  }

  // 1. Sweep every topic. Inter-topic pause matches registry-discovery.ts
  //    so we don't trip the 30 req/min secondary rate limit when sweeping
  //    all topics in a row.
  const byName = new Map<string, TopicCandidate>();
  let candidatesFound = 0;
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    if (i > 0) await delay(2500);
    try {
      const found = await searchReposByTopic(
        topic,
        token,
        pagesPerTopic,
        failures,
      );
      candidatesFound += found.length;
      for (const c of found) {
        const existing = byName.get(c.fullName);
        if (!existing) {
          byName.set(c.fullName, c);
        } else {
          // Merge topic list so the first-seen record carries them all.
          for (const t of c.topics) {
            if (!existing.topics.includes(t)) existing.topics.push(t);
          }
        }
      }
    } catch (err) {
      failures.push({
        step: `search:${topic}`,
        message: (err as Error).message,
      });
    }
  }
  const candidatesAfterDedupe = byName.size;

  // 2. Drop repos already in the registry.
  const known = await readAllEntries();
  const knownNames = new Set(known.map((e) => e.fullName));
  const fresh = Array.from(byName.values()).filter(
    (c) => !knownNames.has(c.fullName),
  );

  // Order: stars descending so a bounded verify pass concentrates budget
  // on the highest-signal repos first.
  fresh.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));

  // 3. Bounded verification pass.
  const nowIso = new Date().toISOString();
  const verifiedEntries: RegistryEntry[] = [];
  let verifiesAttempted = 0;

  for (const cand of fresh) {
    if (verifiesAttempted >= cap) break;
    verifiesAttempted++;

    const { owner, name } = cand;
    if (!owner || !name) continue;

    const probes = await Promise.all(
      ALL_KINDS.map(async (kind) => ({
        kind,
        path: CONFIG_PATHS[kind],
        exists: await pathExists(owner, name, CONFIG_PATHS[kind]).catch(
          () => false,
        ),
      })),
    );
    const present = probes.filter((p) => p.exists);

    // Every probe false → either no config (common for `llm`/`ai-agent`
    // repos that never adopted Cursor/Claude configs) or transient
    // throttle. Skip without writing — next backfill will retry.
    if (present.length === 0) continue;

    const detected: DetectedConfig[] = [];
    for (const p of present) {
      const r = await verifyConfigFile(owner, name, p.path, p.kind);
      if (r.verified) {
        detected.push({
          kind: p.kind,
          path: p.path,
          sample: r.sample,
          score: r.score,
          verifiedAt: nowIso,
        });
      }
    }
    if (detected.length === 0) continue;

    const location = await resolveOwnerLocation(owner);

    verifiedEntries.push({
      fullName: cand.fullName,
      owner,
      name,
      firstSeen: nowIso,
      lastActivity: cand.pushed_at ?? nowIso,
      stars: cand.stars,
      language: cand.language ?? null,
      description: cand.description ?? null,
      configs: detected,
      location,
    });
  }

  // 4. Upsert. firstSeen + location preserved on re-discovery.
  if (verifiedEntries.length > 0) {
    const existingByName = new Map(known.map((e) => [e.fullName, e]));
    const toWrite = verifiedEntries.map((e) => {
      const prev = existingByName.get(e.fullName);
      if (!prev) return e;
      const location = e.location ?? prev.location;
      return { ...e, firstSeen: prev.firstSeen, location };
    });
    await upsertEntries(toWrite);
  }

  const finalEntries = await readAllEntries();
  const finalMeta: RegistryMeta = {
    totalEntries: finalEntries.length,
    verifiedEntries: finalEntries.length,
    lastDiscoveryRun: nowIso,
    lastDiscoverySource: opts.source,
    failures,
  };
  await writeMeta(finalMeta);

  return {
    topicsSwept: topics.length,
    candidatesFound,
    candidatesAfterDedupe,
    candidatesAfterSkipKnown: fresh.length,
    verifiesAttempted,
    written: verifiedEntries.length,
    failures,
  };
}

// ---------------------------------------------------------------------------
// GitHub /search/repositories wrapper
// ---------------------------------------------------------------------------

type RepoSearchItem = {
  full_name?: string;
  name?: string;
  owner?: { login?: string };
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  pushed_at?: string;
};

type RepoSearchResponse = {
  total_count?: number;
  incomplete_results?: boolean;
  items?: RepoSearchItem[];
  message?: string;
};

async function searchReposByTopic(
  topic: string,
  token: string,
  maxPages: number,
  failures: Failure[],
): Promise<TopicCandidate[]> {
  // `topic:` qualifier + sort by stars. Max 1000 results total per query
  // (GitHub search hard cap); at per_page=100, pages 1-10 are valid.
  const q = `topic:${topic}`;
  const out: TopicCandidate[] = [];

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await delay(2200);

    const url =
      `https://api.github.com/search/repositories` +
      `?q=${encodeURIComponent(q)}&sort=stars&order=desc` +
      `&per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

    if (res.status === 422) break; // past deepest usable page
    if (res.status === 403 || res.status === 429) {
      failures.push({
        step: `search:${topic}`,
        message: `rate limited at page ${page}`,
      });
      break;
    }
    if (!res.ok) {
      failures.push({
        step: `search:${topic}`,
        message: `page ${page} returned ${res.status} — keeping ${out.length} earlier items`,
      });
      break;
    }

    const body = (await res.json()) as RepoSearchResponse;
    const items = body.items ?? [];
    for (const it of items) {
      const fullName = it.full_name;
      const owner = it.owner?.login;
      const name = it.name;
      if (!fullName || !owner || !name) continue;
      out.push({
        fullName,
        owner,
        name,
        stars: typeof it.stargazers_count === "number"
          ? it.stargazers_count
          : undefined,
        language: it.language ?? null,
        description: it.description ?? null,
        pushed_at: it.pushed_at,
        topics: [topic],
      });
    }
    if (items.length < 100) break;
  }

  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyResult(failures: Failure[]): TopicsDiscoverResult {
  return {
    topicsSwept: 0,
    candidatesFound: 0,
    candidatesAfterDedupe: 0,
    candidatesAfterSkipKnown: 0,
    verifiesAttempted: 0,
    written: 0,
    failures,
  };
}
