/**
 * Docker Hub ingest — fetches pull + star counters for the tracked
 * container images and overwrites the `pkg:docker:latest` blob.
 *
 * Source of truth: hub.docker.com/v2/repositories/{namespace}/{name}
 *   Response shape: { pull_count, star_count, name, namespace, ... }
 *
 * Docker Hub only publishes `pull_count` (all-time) and `star_count` at
 * the repository level — no last-day / last-week / last-month breakdown
 * is available over the public API. We populate {allTime, stars} and
 * leave the PyPI/npm windows undefined. Day-over-day deltas are
 * reconstructed from the daily snapshot ZSET (PR 1 established that
 * pattern: the registry doesn't emit windows, the history does).
 *
 * We do NOT fetch ghcr.io (GitHub Container Registry) images — the
 * session-32 research brief ruled GHCR out-of-scope for Track A because
 * it requires a separate OAuth handshake for what would be one image
 * (text-generation-inference). Revisit only with a dedicated fetcher.
 *
 * Partial-failure policy mirrors PyPI / npm / crates: ok:true iff ≥ 1
 * image succeeded; ok:false preserves the previous blob untouched.
 */

import {
  writeLatest,
  type PackageCounter,
  type PackageLatest,
} from "@/lib/data/pkg-store";

export const DOCKER_SOURCE_ID = "docker";

/** Namespace-qualified repository ids. Stored in the counters map as
 *  "{namespace}/{name}" so consumers can cite the canonical Docker Hub
 *  URL without re-joining the parts. */
export const DOCKER_TRACKED_IMAGES = [
  "ollama/ollama",
  "vllm/vllm-openai",
] as const;

export type DockerIngestResult = {
  ok: boolean;
  written: number;
  failures: Array<{ pkg: string; message: string }>;
  counters: Record<string, PackageCounter>;
  fetchedAt: string;
};

export type DockerIngestOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  images?: readonly string[];
};

const DOCKER_BASE = "https://hub.docker.com/v2/repositories";
const USER_AGENT = "aipulse/1.0 (+https://gawk.dev)";

export async function runDockerIngest(
  opts: DockerIngestOptions = {},
): Promise<DockerIngestResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const images = opts.images ?? DOCKER_TRACKED_IMAGES;

  const counters: Record<string, PackageCounter> = {};
  const failures: Array<{ pkg: string; message: string }> = [];

  for (const image of images) {
    try {
      counters[image] = await fetchDockerCounter(image, fetchImpl);
    } catch (e) {
      failures.push({
        pkg: image,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const written = Object.keys(counters).length;
  const ok = written > 0;
  const fetchedAt = now().toISOString();

  if (ok) {
    const blob: PackageLatest = {
      source: DOCKER_SOURCE_ID,
      fetchedAt,
      counters,
      failures,
    };
    await writeLatest(blob);
  }

  return { ok, written, failures, counters, fetchedAt };
}

/** Hit hub.docker.com for one image. Throws on non-2xx or malformed body. */
export async function fetchDockerCounter(
  image: string,
  fetchImpl: typeof fetch,
): Promise<PackageCounter> {
  const slash = image.indexOf("/");
  if (slash <= 0 || slash === image.length - 1) {
    throw new Error(`docker: image id must be namespace/name, got "${image}"`);
  }
  const namespace = image.slice(0, slash);
  const name = image.slice(slash + 1);
  const url = `${DOCKER_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/`;
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`docker ${image} HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  return parseDockerCounter(body);
}

/** Parse a hub.docker.com /v2/repositories body. Pure — no I/O. */
export function parseDockerCounter(body: unknown): PackageCounter {
  if (!body || typeof body !== "object") {
    throw new Error("docker: non-object body");
  }
  const o = body as Record<string, unknown>;
  const allTime = toCount(o.pull_count, "pull_count");
  const stars = toCount(o.star_count, "star_count");
  return { allTime, stars };
}

function toCount(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`docker: ${field} is not a non-negative finite number`);
  }
  return Math.round(n);
}
