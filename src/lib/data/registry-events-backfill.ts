/**
 * Registry discovery via the existing globe-events buffer.
 *
 * Why this exists: Code Search is throttled (30 req/min) and capped at
 * 1000 results per query, so search-based discovery plateaus quickly. The
 * globe pipeline already ingests every public GitHub event matching nine
 * activity types — that buffer holds 5–20k unique repos at any given
 * moment, and each event already carries `meta.hasAiConfig` from the
 * existing probe step. Re-using that signal as a discovery feed costs
 * zero new Search calls and finds repos that may never surface in a
 * filename search (e.g. private-fork forks where the AI config sits at
 * an unusual path).
 *
 * Pipeline:
 *   1. Read the current globe-events window from Upstash.
 *   2. Group by repo full_name; prefer hasAiConfig=true (the live probe
 *      has already paid the gating cost).
 *   3. Skip repos already in the registry — saves all downstream cost.
 *   4. For each candidate (bounded by `cap`):
 *        a. Probe all six ConfigKind paths via the Contents API. The
 *           existing 30-day Next.js Data Cache fronts these probes, so
 *           a repo that has been seen by the globe pipeline replays
 *           those results for free.
 *        b. For each existing path: run the verifier (first 500 bytes,
 *           deterministic shape match — never an LLM).
 *        c. Fetch repo meta (stars/language/description/pushed_at).
 *        d. Resolve owner location through the shared cache.
 *   5. Upsert verified entries via the same registry path used by the
 *      Code Search pipeline. Existing firstSeen + location are
 *      preserved on re-discovery.
 *
 * Trust contract:
 *   - Same shape verifier as Code Search discovery — nothing reaches the
 *     registry without passing the deterministic content check.
 *   - lastActivity comes straight from GitHub's pushed_at field. The
 *     event timestamp that surfaced this repo is NOT used as a stand-in;
 *     a repo can have a recent event without a recent push (e.g. fork or
 *     watch events) and the registry's decay band must reflect commit
 *     freshness, not event noise.
 *   - When all six probes return false (commonly: rate-limit window),
 *     the candidate is skipped — never written as a "no config" stub.
 *
 * Rate budget per run (cap=100):
 *   - 6 pathExists × 100 = 600 Contents calls (most cached, real cost
 *     ~100–250 fresh calls in steady state).
 *   - Up to 200 verifier calls (≤2 verified paths per repo on average).
 *   - 100 repo-meta calls.
 *   - ≤100 fetchUser calls (owner-location cache absorbs duplicates).
 *   - Worst case ~600 fresh GH calls; 5000/hr budget covers it.
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
import { readWindow } from "./globe-store";
import { pathExists } from "../github";

type Failure = { step: string; message: string };

export type EventsBackfillOptions = {
  /** Max repos to verify this run. Default 100, hard cap 300. */
  cap?: number;
  /** Window minutes to scan in the events buffer. Default 240. */
  windowMinutes?: number;
  /** Label written to RegistryMeta.lastDiscoverySource. */
  source: string;
};

export type EventsBackfillResult = {
  candidatesFound: number;
  candidatesAfterSkipKnown: number;
  verifiesAttempted: number;
  written: number;
  failures: Failure[];
};

const ALL_KINDS: ConfigKind[] = Object.keys(CONFIG_PATHS) as ConfigKind[];

type EventCandidate = {
  fullName: string;
  hasAiConfig: boolean;
  /** Newest event timestamp seen for this repo — used only for ordering. */
  newestEventAt: string;
};

export async function runEventsBackfill(
  opts: EventsBackfillOptions,
): Promise<EventsBackfillResult> {
  const failures: Failure[] = [];
  const cap = Math.max(1, Math.min(300, opts.cap ?? 100));
  const windowMinutes = Math.max(60, Math.min(720, opts.windowMinutes ?? 240));

  if (!isRegistryAvailable()) {
    failures.push({
      step: "availability",
      message: "Upstash Redis not configured — events backfill skipped",
    });
    return emptyResult(failures);
  }

  if (!process.env.GH_TOKEN) {
    failures.push({
      step: "auth",
      message: "GH_TOKEN not set — Contents probes would 60/hr",
    });
    return emptyResult(failures);
  }

  // 1. Pull events out of Upstash. readWindow() handles dedupe by eventId
  //    and the 4h TTL; an empty list means the globe ingest hasn't run
  //    recently — skip rather than fabricate.
  const events = await readWindow(windowMinutes);
  if (events.length === 0) {
    failures.push({
      step: "events-buffer",
      message: "globe-events buffer empty — nothing to backfill from",
    });
    return emptyResult(failures);
  }

  // 2. Collapse to one candidate per repo. Keep the newest event timestamp
  //    only for ordering; lastActivity will come from pushed_at.
  const byRepo = new Map<string, EventCandidate>();
  for (const ev of events) {
    const meta = (ev.meta ?? {}) as { repo?: string; hasAiConfig?: boolean };
    const fullName = typeof meta.repo === "string" ? meta.repo : null;
    if (!fullName || !fullName.includes("/")) continue;
    const existing = byRepo.get(fullName);
    const hasAi = meta.hasAiConfig === true;
    if (!existing) {
      byRepo.set(fullName, {
        fullName,
        hasAiConfig: hasAi,
        newestEventAt: ev.eventAt,
      });
    } else {
      if (hasAi) existing.hasAiConfig = true;
      if (ev.eventAt > existing.newestEventAt) {
        existing.newestEventAt = ev.eventAt;
      }
    }
  }
  const candidatesFound = byRepo.size;

  // 3. Drop repos already in the registry — re-verification is the job
  //    of the periodic Code Search sweep with skipKnown=0, not this fast
  //    backfill path.
  const known = await readAllEntries();
  const knownNames = new Set(known.map((e) => e.fullName));
  const fresh = Array.from(byRepo.values()).filter(
    (c) => !knownNames.has(c.fullName),
  );

  // Order: hasAiConfig=true first (we already paid the gating probe in
  // the live pipeline → highest verify-pass odds). Within each band,
  // newest event first so a backfill that hits the cap surfaces the most
  // recently active repos.
  fresh.sort((a, b) => {
    if (a.hasAiConfig !== b.hasAiConfig) return a.hasAiConfig ? -1 : 1;
    return b.newestEventAt.localeCompare(a.newestEventAt);
  });

  // 4. Bounded verification pass.
  const nowIso = new Date().toISOString();
  const verifiedEntries: RegistryEntry[] = [];
  let verifiesAttempted = 0;

  const token = process.env.GH_TOKEN;

  for (const cand of fresh) {
    if (verifiesAttempted >= cap) break;
    verifiesAttempted++;

    const [owner, name] = cand.fullName.split("/");
    if (!owner || !name) continue;

    // 4a. Probe all six paths. pathExists swallows transient errors as
    // false; that means "absent OR rate-limited" — we cope by skipping
    // the repo when *every* probe is false (likely throttle), see below.
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

    // Likely transient: globe pipeline saw an AI config but every probe
    // now returns false. Don't write a "no config" entry that locks out
    // future discovery — skip and try again on the next backfill.
    if (present.length === 0) {
      if (cand.hasAiConfig) {
        failures.push({
          step: `probe:${cand.fullName}`,
          message:
            "globe meta said hasAiConfig=true but all 6 probes returned false; treating as transient",
        });
      }
      continue;
    }

    // 4b. Verify each present path.
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

    // 4c. Repo metadata.
    const meta = await fetchRepoMeta(owner, name, token!).catch((err) => {
      failures.push({
        step: `repo-meta:${cand.fullName}`,
        message: (err as Error).message,
      });
      return null;
    });
    if (!meta) continue;

    // 4d. Owner location through the shared cache (silent null on miss).
    const location = await resolveOwnerLocation(owner);

    verifiedEntries.push({
      fullName: cand.fullName,
      owner,
      name,
      firstSeen: nowIso,
      lastActivity: meta.pushed_at ?? nowIso,
      stars: typeof meta.stargazers_count === "number"
        ? meta.stargazers_count
        : undefined,
      language: meta.language ?? null,
      description: meta.description ?? null,
      configs: detected,
      location,
    });
  }

  // 5. Upsert. firstSeen + location preserved on re-discovery.
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

  // Write meta so the source label shows up in /api/registry.meta even
  // when this backfill runs in isolation from the Code Search sweep.
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
    candidatesFound,
    candidatesAfterSkipKnown: fresh.length,
    verifiesAttempted,
    written: verifiedEntries.length,
    failures,
  };
}

type RepoMeta = {
  pushed_at?: string;
  stargazers_count?: number;
  language?: string | null;
  description?: string | null;
};

async function fetchRepoMeta(
  owner: string,
  name: string,
  token: string,
): Promise<RepoMeta | null> {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`repo meta ${res.status}`);
  return (await res.json()) as RepoMeta;
}

function emptyResult(failures: Failure[]): EventsBackfillResult {
  return {
    candidatesFound: 0,
    candidatesAfterSkipKnown: 0,
    verifiesAttempted: 0,
    written: 0,
    failures,
  };
}
