/**
 * npm ingest — fetches rolling download counters for the tracked AI-SDK
 * packages from api.npmjs.org and overwrites the `pkg:npm:latest` blob.
 *
 * Source of truth: api.npmjs.org/downloads/point/{window}/{pkg}
 *   Response shape: { downloads, start, end, package }
 *   Windows used: last-day, last-week, last-month (mirrors PyPI shape).
 *
 * api.npmjs.org IS the npm registry's own analytics endpoint — first-party
 * provenance, unlike the PyPI path which goes through pypistats.org. No
 * API key required; no documented per-IP rate limit.
 *
 * Scoped packages (e.g. @anthropic-ai/sdk, @langchain/core): the `@scope/
 * name` path segment is used verbatim, NOT url-encoded — encoding the `/`
 * causes npm to 404. The `@` is encoded safely by URL semantics either
 * way but we skip encoding to keep the URL human-readable in logs.
 *
 * Partial-failure policy mirrors PyPI: one blob per source, ok:true iff
 * ≥ 1 package succeeded, ok:false preserves the previous blob so readers
 * never flip to zero on a transient upstream blip. Per-window failure
 * inside a single package is treated as a whole-package failure — we
 * surface only counters where all three windows resolved, never a half-
 * populated row.
 */

import {
  writeLatest,
  type PackageCounter,
  type PackageLatest,
} from "@/lib/data/pkg-store";

export const NPM_SOURCE_ID = "npm";

export const NPM_TRACKED_PACKAGES = [
  "@anthropic-ai/sdk",
  "openai",
  "@langchain/core",
  "ai",
  "llamaindex",
] as const;

export const NPM_WINDOWS = ["last-day", "last-week", "last-month"] as const;
export type NpmWindow = (typeof NPM_WINDOWS)[number];

export type NpmIngestResult = {
  ok: boolean;
  written: number;
  failures: Array<{ pkg: string; message: string }>;
  counters: Record<string, PackageCounter>;
  fetchedAt: string;
};

export type NpmIngestOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  packages?: readonly string[];
};

const NPM_BASE = "https://api.npmjs.org/downloads/point";
const USER_AGENT = "aipulse/1.0 (+https://aipulse-pi.vercel.app)";

export async function runNpmIngest(
  opts: NpmIngestOptions = {},
): Promise<NpmIngestResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const packages = opts.packages ?? NPM_TRACKED_PACKAGES;

  const counters: Record<string, PackageCounter> = {};
  const failures: Array<{ pkg: string; message: string }> = [];

  for (const pkg of packages) {
    try {
      counters[pkg] = await fetchNpmCounter(pkg, fetchImpl);
    } catch (e) {
      failures.push({
        pkg,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const written = Object.keys(counters).length;
  const ok = written > 0;
  const fetchedAt = now().toISOString();

  if (ok) {
    const blob: PackageLatest = {
      source: NPM_SOURCE_ID,
      fetchedAt,
      counters,
      failures,
    };
    await writeLatest(blob);
  }

  return { ok, written, failures, counters, fetchedAt };
}

/** Fetch one package's three rolling windows. Throws if any window fails
 *  — we never write a half-populated counter row. */
export async function fetchNpmCounter(
  pkg: string,
  fetchImpl: typeof fetch,
): Promise<PackageCounter> {
  const [lastDay, lastWeek, lastMonth] = await Promise.all([
    fetchNpmPoint(pkg, "last-day", fetchImpl),
    fetchNpmPoint(pkg, "last-week", fetchImpl),
    fetchNpmPoint(pkg, "last-month", fetchImpl),
  ]);
  return { lastDay, lastWeek, lastMonth };
}

/** Hit api.npmjs.org for one (package, window) pair. Throws on non-2xx
 *  or malformed body. Returns a non-negative integer download count. */
export async function fetchNpmPoint(
  pkg: string,
  window: NpmWindow,
  fetchImpl: typeof fetch,
): Promise<number> {
  const url = `${NPM_BASE}/${window}/${pkg}`;
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`npm ${pkg} ${window} HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  return parseNpmPoint(body, window);
}

/** Parse an api.npmjs.org /downloads/point body. Pure — no I/O. */
export function parseNpmPoint(body: unknown, window: NpmWindow): number {
  if (!body || typeof body !== "object") {
    throw new Error(`npm ${window}: non-object body`);
  }
  const o = body as Record<string, unknown>;
  if ("error" in o && typeof o.error === "string") {
    throw new Error(`npm ${window}: ${o.error}`);
  }
  const raw = o.downloads;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`npm ${window}: downloads is not a non-negative finite number`);
  }
  return Math.round(n);
}
