/**
 * Registry discovery via npm reverse-dependencies — source #6 of the
 * discovery pipeline.
 *
 * Why ecosyste.ms and not deps.dev: we approved deps.dev initially, but
 * its public REST API returns only a count (`dependentCount` /
 * `directDependentCount`) for any package — not the list of dependent
 * package names or their repository URLs. We need the actual list to
 * resolve downstream GitHub repos. ecosyste.ms is a Google-adjacent free
 * JSON index (5000 req/hr anonymous, no auth) that returns a paginated
 * list with `repository_url` directly on each row. Same provenance
 * class as deps.dev — third-party package index, not npm itself — so
 * the data-sources.md caveat reads the same.
 *
 * Pipeline per run:
 *   1. For each target package (Anthropic SDK, OpenAI SDK, LangChain,
 *      LangChain Core, Vercel AI SDK, LlamaIndex), hit
 *      `/api/v1/registries/npmjs.org/packages/<pkg>/dependent_packages`
 *      sorted by latest_release_published_at desc — active dependents
 *      first, so the bounded cap concentrates budget on packages that
 *      still ship releases.
 *   2. Parse `repository_url` → {owner, name}. Filter to github.com
 *      only (occasional gitlab/bitbucket rows are dropped — our
 *      verifier talks to the GitHub Contents API).
 *   3. Dedupe by full_name across all target packages.
 *   4. Skip repos already in the registry.
 *   5. For each candidate (bounded by cap), run the same six-filename
 *      Contents-API probe + first-500-bytes shape verifier used by
 *      Code Search and Topics discovery. A package depending on the
 *      Anthropic SDK is a candidate signal only; a verified config
 *      file is what promotes it to the registry.
 *   6. Fetch repo meta (stars / language / pushed_at) via the GitHub
 *      /repos endpoint for the small number of verified hits — the
 *      dependent_packages row only carries npm metadata.
 *   7. Resolve owner location + upsert.
 *
 * Trust contract:
 *   - A dependents list is *declared* (package.json says `openai:
 *     ^4.0.0`) — evidence of intent, not of AI-tooling shape. Same gate
 *     as topics: the verifier is the truth signal.
 *   - ecosyste.ms re-indexes npm on its own cadence; rows may lag by
 *     hours to days. We don't treat this as real-time — the cron fires
 *     every 6h and newly published dependents show up across a few
 *     cycles rather than instantly.
 *
 * Rate budget per run (cap=60, 6 packages × 2 pages = 12 ecosyste.ms
 * calls + GitHub calls for verified hits):
 *   - ecosyste.ms: 12 calls / 5000-hr anonymous budget → immaterial.
 *   - GitHub Contents probes: 6 × 60 = 360 (mostly cached after the
 *     first backfill).
 *   - Verifier: ≤120 calls (≤2 present paths per repo on average).
 *   - Repo meta: ≤cap calls (1 per verified candidate).
 *   - Owner location: ≤cap calls via the shared resolver cache.
 *   - Worst case ~550 fresh GitHub calls; well inside the 5000/hr
 *     authenticated budget.
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
 * Target npm packages. These are the canonical AI-tool SDKs + frameworks
 * whose dependents skew toward AI-coding territory. Ordered roughly by
 * expected signal density (SDKs first — dependents are apps using the
 * tool directly; frameworks second — dependents can be plugins).
 */
export const TARGET_PACKAGES: readonly string[] = [
  "@anthropic-ai/sdk",
  "openai",
  "@langchain/core",
  "langchain",
  "ai",
  "llamaindex",
] as const;

const ALL_KINDS: ConfigKind[] = Object.keys(CONFIG_PATHS) as ConfigKind[];

const ECOSYSTEMS_BASE =
  "https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages";

export type DepsDiscoverOptions = {
  /** Packages to sweep this run. Defaults to TARGET_PACKAGES. */
  packages?: readonly string[];
  /** Pages per package (1-10). Default 2 → up to 200 dependents per package. */
  pagesPerPackage?: number;
  /** Max verifications per run. Default 60, hard cap 200. */
  cap?: number;
  /** Label written to RegistryMeta.lastDiscoverySource. */
  source: string;
};

export type DepsDiscoverResult = {
  packagesSwept: number;
  candidatesFound: number;
  candidatesAfterDedupe: number;
  candidatesAfterSkipKnown: number;
  verifiesAttempted: number;
  written: number;
  failures: Failure[];
};

type DepCandidate = {
  fullName: string;
  owner: string;
  name: string;
  /** npm package name that surfaced this repo (debug signal). */
  viaPackages: string[];
  /** ecosyste.ms latest_release_published_at — a freshness proxy. */
  latestReleaseAt?: string;
};

export async function runDepsDiscovery(
  opts: DepsDiscoverOptions,
): Promise<DepsDiscoverResult> {
  const failures: Failure[] = [];
  const packages = opts.packages ?? TARGET_PACKAGES;
  const pagesPerPackage = Math.max(1, Math.min(10, opts.pagesPerPackage ?? 2));
  const cap = Math.max(1, Math.min(200, opts.cap ?? 60));

  if (!isRegistryAvailable()) {
    failures.push({
      step: "availability",
      message: "Upstash Redis not configured — deps discovery skipped",
    });
    return emptyResult(failures);
  }

  const token = process.env.GH_TOKEN;
  if (!token) {
    failures.push({
      step: "auth",
      message: "GH_TOKEN not set — cannot verify candidates via Contents API",
    });
    return emptyResult(failures);
  }

  // 1. Sweep every target package. Inter-package pause is small — 5000/hr
  //    on ecosyste.ms is orders of magnitude above our usage. The pause
  //    exists only to avoid hammering the API as a polite neighbour.
  const byName = new Map<string, DepCandidate>();
  let candidatesFound = 0;
  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];
    if (i > 0) await delay(500);
    try {
      const found = await fetchDependents(pkg, pagesPerPackage, failures);
      candidatesFound += found.length;
      for (const c of found) {
        const existing = byName.get(c.fullName);
        if (!existing) {
          byName.set(c.fullName, c);
        } else {
          for (const p of c.viaPackages) {
            if (!existing.viaPackages.includes(p)) existing.viaPackages.push(p);
          }
          // Keep the most-recent latestReleaseAt so the downstream sort
          // reflects the freshest signal across packages.
          if (
            c.latestReleaseAt &&
            (!existing.latestReleaseAt ||
              c.latestReleaseAt > existing.latestReleaseAt)
          ) {
            existing.latestReleaseAt = c.latestReleaseAt;
          }
        }
      }
    } catch (err) {
      failures.push({
        step: `fetch:${pkg}`,
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

  // Order by freshness: packages released most recently first. A cap-60
  // pass over active-maintenance dependents dominates any sort we could
  // derive from GitHub stars (which we don't have until after verify).
  fresh.sort((a, b) =>
    (b.latestReleaseAt ?? "").localeCompare(a.latestReleaseAt ?? ""),
  );

  // 3. Bounded verification pass — same shape as registry-topics.ts.
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

    const meta = await fetchRepoMeta(owner, name, token).catch((err) => {
      failures.push({
        step: `repo-meta:${owner}/${name}`,
        message: (err as Error).message,
      });
      return null;
    });

    const location = await resolveOwnerLocation(owner);

    verifiedEntries.push({
      fullName: cand.fullName,
      owner,
      name,
      firstSeen: nowIso,
      lastActivity: meta?.pushed_at ?? cand.latestReleaseAt ?? nowIso,
      stars: meta?.stargazers_count,
      language: meta?.language ?? null,
      description: meta?.description ?? null,
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
    packagesSwept: packages.length,
    candidatesFound,
    candidatesAfterDedupe,
    candidatesAfterSkipKnown: fresh.length,
    verifiesAttempted,
    written: verifiedEntries.length,
    failures,
  };
}

// ---------------------------------------------------------------------------
// ecosyste.ms /dependent_packages wrapper
// ---------------------------------------------------------------------------

type EcosystemsRow = {
  name?: string;
  repository_url?: string | null;
  latest_release_published_at?: string | null;
};

async function fetchDependents(
  pkg: string,
  maxPages: number,
  failures: Failure[],
): Promise<DepCandidate[]> {
  const pkgEncoded = encodeURIComponent(pkg);
  const out: DepCandidate[] = [];

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await delay(300);
    const url =
      `${ECOSYSTEMS_BASE}/${pkgEncoded}/dependent_packages` +
      `?per_page=100&page=${page}` +
      `&sort=latest_release_published_at&order=desc`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "aipulse-registry-discovery (+https://gawk.dev)",
      },
      cache: "no-store",
    });
    if (res.status === 404) break;
    if (res.status === 429) {
      failures.push({
        step: `fetch:${pkg}`,
        message: `ecosyste.ms rate-limited at page ${page}`,
      });
      break;
    }
    if (!res.ok) {
      failures.push({
        step: `fetch:${pkg}`,
        message: `page ${page} returned ${res.status}`,
      });
      break;
    }

    const body = (await res.json()) as EcosystemsRow[];
    if (!Array.isArray(body) || body.length === 0) break;
    for (const row of body) {
      const repoUrl = row.repository_url ?? "";
      const parsed = parseGithubRepoUrl(repoUrl);
      if (!parsed) continue;
      out.push({
        fullName: `${parsed.owner}/${parsed.name}`,
        owner: parsed.owner,
        name: parsed.name,
        viaPackages: [pkg],
        latestReleaseAt: row.latest_release_published_at ?? undefined,
      });
    }
    if (body.length < 100) break;
  }

  return out;
}

/**
 * Extract {owner, name} from a repository_url, accepting only github.com
 * repos. Strips trailing `.git`, trailing slash, and any subpath. Returns
 * null for non-github hosts (our verifier pipe only speaks to GitHub).
 */
function parseGithubRepoUrl(
  url: string | null | undefined,
): { owner: string; name: string } | null {
  if (!url) return null;
  let normalised = url.trim();
  if (!normalised) return null;
  // Accept both https and git-protocol.
  normalised = normalised
    .replace(/^git\+https:\/\//, "https://")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://");
  const match =
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i.exec(
      normalised,
    );
  if (!match) return null;
  const owner = match[1].trim();
  const name = match[2].trim();
  if (!owner || !name) return null;
  // Skip owner-level (no name) and path traversal edge cases.
  if (owner === "." || name === ".") return null;
  return { owner, name };
}

// ---------------------------------------------------------------------------
// GitHub /repos/{owner}/{repo} wrapper — same shape as the one in
// registry-events-backfill.ts and registry-discovery.ts. Duplicated
// deliberately: each discovery module stays self-contained so changes
// to one path (e.g. a new field) don't ripple across the others.
// ---------------------------------------------------------------------------

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyResult(failures: Failure[]): DepsDiscoverResult {
  return {
    packagesSwept: 0,
    candidatesFound: 0,
    candidatesAfterDedupe: 0,
    candidatesAfterSkipKnown: 0,
    verifiesAttempted: 0,
    written: 0,
    failures,
  };
}
