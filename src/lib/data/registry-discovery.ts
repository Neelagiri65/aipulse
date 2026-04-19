/**
 * Registry discovery — the write path for `repo-registry`.
 *
 * Pipeline per run:
 *   1. For each ConfigKind: hit GitHub Code Search for the canonical
 *      filename. Collect candidates (repo + path).
 *   2. Dedupe by (full_name, path) — same repo can appear across pages.
 *   3. Optionally filter out repos already in the registry (saves rate
 *      budget on subsequent runs so we verify *new* repos first).
 *   4. For each candidate (bounded by `maxVerify`):
 *        a. Fetch repo metadata via /repos/{owner}/{repo} — gives us
 *           stars / language / description / pushed_at. One API call.
 *        b. Verify the config file via the first-500-bytes heuristic
 *           (see config-verifier.ts). One API call.
 *   5. Upsert all verified entries into the registry in a single HSET.
 *
 * Rate-budget math (authenticated GH_TOKEN, 5000 req/hr = 83/min):
 *   - Per-candidate cost: 2 calls (repo meta + content verify).
 *   - At 60s Vercel maxDuration, a cron run can handle ~40 candidates
 *     safely. We cap `maxVerify` at 40 for cron, 200 for manual seed
 *     runs (which get 300s maxDuration).
 *   - Code-search cost: 10 pages × 6 kinds = 60 calls on a seed run.
 *     Well inside the 30-req/min search budget (2 min at full burst).
 *
 * Trust contract: only writes entries that pass verifier (score ≥ 0.4).
 * Each written entry carries the verifier score and the sampled bytes
 * so downstream surfaces can show WHY it's in the registry.
 */

import {
  CONFIG_PATHS,
  isRegistryAvailable,
  readAllEntries,
  upsertEntries,
  writeMeta,
  type ConfigKind,
  type DetectedConfig,
  type RegistryEntry,
  type RegistryMeta,
} from "./repo-registry";
import { verifyConfigFile } from "./config-verifier";
import { resolveOwnerLocation } from "./owner-location";

const ALL_KINDS: ConfigKind[] = Object.keys(CONFIG_PATHS) as ConfigKind[];

export type DiscoverOptions = {
  /** Which filename kinds to sweep. Defaults to all 6. */
  kinds?: ConfigKind[];
  /** Max candidate verifications to run this pass. Default 40 (cron-safe). */
  maxVerify?: number;
  /**
   * When true, skip repos already in the registry so new runs spend
   * budget finding *new* repos rather than re-verifying old ones.
   * Use false for a periodic re-verification sweep. Default true.
   */
  skipKnown?: boolean;
  /** Max code-search pages per kind (each page = 100 candidates, max 10). */
  searchPagesPerKind?: number;
  /** Label for RegistryMeta.lastDiscoverySource. */
  source: string;
};

export type DiscoverResult = {
  candidatesFound: number;
  candidatesDeduped: number;
  verifiesAttempted: number;
  verified: number;
  written: number;
  failures: Array<{ step: string; message: string }>;
};

type Candidate = {
  fullName: string;
  owner: string;
  name: string;
  path: string;
  kind: ConfigKind;
};

/**
 * Run one pass of registry discovery. Safe to call repeatedly — writes
 * are idempotent (HSET by fullName).
 */
export async function runRegistryDiscovery(
  opts: DiscoverOptions,
): Promise<DiscoverResult> {
  const failures: Array<{ step: string; message: string }> = [];
  const kinds = opts.kinds ?? ALL_KINDS;
  const maxVerify = Math.max(1, Math.min(500, opts.maxVerify ?? 40));
  const searchPagesPerKind = Math.max(
    1,
    Math.min(10, opts.searchPagesPerKind ?? 3),
  );
  const skipKnown = opts.skipKnown ?? true;

  if (!isRegistryAvailable()) {
    failures.push({
      step: "availability",
      message: "Upstash Redis not configured — registry discovery skipped",
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

  // 1. Collect candidates via Code Search. Each kind runs sequentially
  //    with an inter-kind pause so we don't trip the 30 req/min secondary
  //    rate limit when sweeping all 6 kinds in a row. First seed run on
  //    a cold Vercel instance observed: claude-md alone (10 pages) can
  //    exhaust the minute budget; later kinds then 403 on page 1. The
  //    10s inter-kind gap lets the budget partially refill so at least
  //    page 1 of each kind lands even under full load.
  const allCandidates: Candidate[] = [];
  const recordFailure = (step: string, message: string) => {
    failures.push({ step, message });
  };
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    if (i > 0) await delay(10000);
    try {
      const found = await searchCodeByFilename(
        kind,
        CONFIG_PATHS[kind],
        token,
        searchPagesPerKind,
        recordFailure,
      );
      allCandidates.push(...found);
    } catch (err) {
      recordFailure(`search:${kind}`, (err as Error).message);
    }
  }

  // 2. Dedupe by fullName + path. Same repo with the same file across
  //    search pages should only verify once.
  const byKey = new Map<string, Candidate>();
  for (const c of allCandidates) {
    const key = `${c.fullName}::${c.path}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  const deduped = Array.from(byKey.values());

  // 3. Filter known repos if requested. Done at the (fullName) granularity
  //    — if we already verified CLAUDE.md for owner/repo, we don't need to
  //    re-verify it this run; the next periodic sweep (skipKnown=false)
  //    will catch updates.
  let candidates = deduped;
  if (skipKnown) {
    const known = await readAllEntries();
    const knownNames = new Set(known.map((e) => e.fullName));
    candidates = deduped.filter((c) => !knownNames.has(c.fullName));
  }

  // 4. Bounded verification pass. Group by fullName so one repo's multiple
  //    configs share a single metadata fetch.
  const byRepo = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = byRepo.get(c.fullName) ?? [];
    list.push(c);
    byRepo.set(c.fullName, list);
  }

  const verifiedEntries: RegistryEntry[] = [];
  let verifiesAttempted = 0;
  const nowIso = new Date().toISOString();

  for (const [fullName, configs] of byRepo) {
    if (verifiesAttempted >= maxVerify) break;

    const [owner, name] = fullName.split("/");
    if (!owner || !name) continue;

    // Repo metadata once per repo.
    const meta = await fetchRepoMeta(owner, name, token).catch((err) => {
      failures.push({
        step: `repo-meta:${fullName}`,
        message: (err as Error).message,
      });
      return null;
    });
    if (!meta) continue;

    const detected: DetectedConfig[] = [];
    for (const cfg of configs) {
      if (verifiesAttempted >= maxVerify) break;
      verifiesAttempted++;
      const r = await verifyConfigFile(owner, name, cfg.path, cfg.kind);
      if (r.verified) {
        detected.push({
          kind: cfg.kind,
          path: cfg.path,
          sample: r.sample,
          score: r.score,
          verifiedAt: nowIso,
        });
      }
    }

    if (detected.length === 0) continue;

    // Owner location lookup — cached in aipulse:registry:owner-location so
    // the ~200 entries in a seed run only cost a fetchUser for each *new*
    // owner, not per-repo. Silently resolves to null on rate limit /
    // missing profile string; entry stores that null so UI can skip it.
    const location = await resolveOwnerLocation(owner);

    verifiedEntries.push({
      fullName,
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

  // 5. Upsert. Preserve firstSeen from existing entries so re-verification
  //    doesn't reset the "discovered on X" stamp. Also preserve an existing
  //    resolved location when the new pass couldn't resolve one (transient
  //    GH failure shouldn't blank out good data).
  if (verifiedEntries.length > 0) {
    const existing = await readAllEntries();
    const existingByName = new Map(existing.map((e) => [e.fullName, e]));
    const toWrite = verifiedEntries.map((e) => {
      const prev = existingByName.get(e.fullName);
      if (!prev) return e;
      const location = e.location ?? prev.location;
      return { ...e, firstSeen: prev.firstSeen, location };
    });
    await upsertEntries(toWrite);
  }

  // 5b. Enrichment pass: geocode entries written *before* location support
  //     existed (location === undefined). Bounded so a seed run doesn't
  //     blow its budget on back-fill. Each subsequent run chips away.
  const ENRICH_CAP = 100;
  await enrichMissingLocations(ENRICH_CAP, failures);

  // 6. Meta write.
  const finalEntries = await readAllEntries();
  const finalMeta: RegistryMeta = {
    totalEntries: finalEntries.length,
    verifiedEntries: finalEntries.length, // every entry in registry is verified by construction
    lastDiscoveryRun: nowIso,
    lastDiscoverySource: opts.source,
    failures,
  };
  await writeMeta(finalMeta);

  return {
    candidatesFound: allCandidates.length,
    candidatesDeduped: deduped.length,
    verifiesAttempted,
    verified: verifiedEntries.length,
    written: verifiedEntries.length,
    failures,
  };
}

// ---------------------------------------------------------------------------
// GitHub API wrappers
// ---------------------------------------------------------------------------

type CodeSearchItem = {
  name: string;
  path: string;
  repository?: {
    full_name: string;
    owner?: { login: string };
    name?: string;
  };
};

type CodeSearchResponse = {
  total_count?: number;
  incomplete_results?: boolean;
  items?: CodeSearchItem[];
  message?: string;
};

async function searchCodeByFilename(
  kind: ConfigKind,
  canonicalPath: string,
  token: string,
  maxPages: number,
  onFailure: (step: string, message: string) => void,
): Promise<Candidate[]> {
  // Nested paths (.github/copilot-instructions.md, .continue/config.json):
  // use filename: + path:<dir>. GitHub's path: qualifier matches the parent
  // directory, NOT the full file path — passing the full path returns 404.
  // Flat names (CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules):
  // filename: alone is distinctive.
  const segs = canonicalPath.split("/");
  const filename = segs[segs.length - 1];
  const dir = segs.length > 1 ? segs.slice(0, -1).join("/") : "";
  const q = dir ? `filename:${filename} path:${dir}` : `filename:${filename}`;

  const out: Candidate[] = [];
  for (let page = 1; page <= maxPages; page++) {
    // Stay under the 30 req/min Search API cap: ~2s between calls is safe.
    if (page > 1) await delay(1500);

    const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    // All non-ok responses are "stop paginating for this kind" — never fatal.
    // We preserve the items already collected from earlier pages.
    if (res.status === 422) break; // past the deepest usable page
    if (res.status === 403 || res.status === 429) {
      onFailure(`search:${kind}`, `rate limited at page ${page}`);
      break;
    }
    if (!res.ok) {
      onFailure(
        `search:${kind}`,
        `page ${page} returned ${res.status} — keeping ${out.length} earlier items`,
      );
      break;
    }
    const body = (await res.json()) as CodeSearchResponse;
    const items = body.items ?? [];
    for (const it of items) {
      const fullName = it.repository?.full_name;
      if (!fullName) continue;
      const [owner, name] = fullName.split("/");
      if (!owner || !name) continue;
      out.push({ owner, name, fullName, path: it.path || canonicalPath, kind });
    }
    if (items.length < 100) break;
  }
  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Back-fill owner locations for entries written before location support
 * existed (location === undefined). Tri-state semantics: we only retry
 * entries where location is missing entirely, never ones where it was
 * explicitly set to null (already looked up, dead end).
 *
 * Bounded to `cap` GH calls per run so a seed dispatch doesn't spend its
 * whole budget here. Over ~5 runs the 2k target finishes back-filling.
 */
async function enrichMissingLocations(
  cap: number,
  failures: Array<{ step: string; message: string }>,
): Promise<void> {
  if (cap <= 0) return;
  const entries = await readAllEntries();
  const missing = entries.filter((e) => e.location === undefined);
  if (missing.length === 0) return;

  // Group by owner so one fetchUser covers every repo from that owner.
  const byOwner = new Map<string, RegistryEntry[]>();
  for (const e of missing) {
    const list = byOwner.get(e.owner) ?? [];
    list.push(e);
    byOwner.set(e.owner, list);
  }

  const patched: RegistryEntry[] = [];
  let lookups = 0;
  for (const [owner, group] of byOwner) {
    if (lookups >= cap) break;
    lookups++;
    let loc;
    try {
      loc = await resolveOwnerLocation(owner);
    } catch (err) {
      failures.push({
        step: `enrich:${owner}`,
        message: (err as Error).message,
      });
      continue;
    }
    for (const e of group) patched.push({ ...e, location: loc });
  }

  if (patched.length > 0) await upsertEntries(patched);
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

function emptyResult(
  failures: Array<{ step: string; message: string }>,
): DiscoverResult {
  return {
    candidatesFound: 0,
    candidatesDeduped: 0,
    verifiesAttempted: 0,
    verified: 0,
    written: 0,
    failures,
  };
}
