/**
 * Homebrew ingest — fetches install counters for the tracked formulae
 * and overwrites the `pkg:brew:latest` blob.
 *
 * Source of truth: formulae.brew.sh/api/formula/{name}.json
 *   Response shape: { name, analytics: { install: { 30d|90d|365d: { <key>: count } } } }
 *
 * Homebrew's install analytics bucket counts by the command form that
 * invoked the install, so a formula named `ollama` can appear under
 * the keys `ollama`, `ollama@0.1.5`, `ollama HEAD`, etc. We sum every
 * key's count — the headline number is total installs of the formula
 * across all version qualifiers, which matches how Homebrew's own
 * analytics dashboard presents it.
 *
 * Three windows are populated: {lastMonth, last90d, lastYear} from the
 * 30d / 90d / 365d buckets. No last-day or last-week window is exposed.
 *
 * Rate-limit etiquette: formulae.brew.sh is a CDN-fronted static JSON
 * endpoint. No documented per-IP limit.
 *
 * Partial-failure policy mirrors PyPI / npm / crates / docker: ok:true
 * iff ≥ 1 formula succeeded; ok:false preserves the previous blob.
 */

import {
  writeLatest,
  type PackageCounter,
  type PackageLatest,
} from "@/lib/data/pkg-store";

export const BREW_SOURCE_ID = "brew";

export const BREW_TRACKED_FORMULAE = ["ollama"] as const;

export type BrewIngestResult = {
  ok: boolean;
  written: number;
  failures: Array<{ pkg: string; message: string }>;
  counters: Record<string, PackageCounter>;
  fetchedAt: string;
};

export type BrewIngestOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  formulae?: readonly string[];
};

const BREW_BASE = "https://formulae.brew.sh/api/formula";
const USER_AGENT = "aipulse/1.0 (+https://aipulse-pi.vercel.app)";

export async function runBrewIngest(
  opts: BrewIngestOptions = {},
): Promise<BrewIngestResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const formulae = opts.formulae ?? BREW_TRACKED_FORMULAE;

  const counters: Record<string, PackageCounter> = {};
  const failures: Array<{ pkg: string; message: string }> = [];

  for (const formula of formulae) {
    try {
      counters[formula] = await fetchBrewCounter(formula, fetchImpl);
    } catch (e) {
      failures.push({
        pkg: formula,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const written = Object.keys(counters).length;
  const ok = written > 0;
  const fetchedAt = now().toISOString();

  if (ok) {
    const blob: PackageLatest = {
      source: BREW_SOURCE_ID,
      fetchedAt,
      counters,
      failures,
    };
    await writeLatest(blob);
  }

  return { ok, written, failures, counters, fetchedAt };
}

/** Hit formulae.brew.sh for one formula. Throws on non-2xx or malformed body. */
export async function fetchBrewCounter(
  formula: string,
  fetchImpl: typeof fetch,
): Promise<PackageCounter> {
  const url = `${BREW_BASE}/${encodeURIComponent(formula)}.json`;
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`brew ${formula} HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  return parseBrewCounter(body);
}

/** Parse a formulae.brew.sh formula body. Pure — no I/O. */
export function parseBrewCounter(body: unknown): PackageCounter {
  if (!body || typeof body !== "object") {
    throw new Error("brew: non-object body");
  }
  const o = body as Record<string, unknown>;
  const analytics = o.analytics;
  if (!analytics || typeof analytics !== "object") {
    throw new Error("brew: missing analytics field");
  }
  const a = analytics as Record<string, unknown>;
  const install = a.install;
  if (!install || typeof install !== "object") {
    throw new Error("brew: missing analytics.install field");
  }
  const i = install as Record<string, unknown>;
  const lastMonth = sumBucket(i["30d"], "30d");
  const last90d = sumBucket(i["90d"], "90d");
  const lastYear = sumBucket(i["365d"], "365d");
  return { lastMonth, last90d, lastYear };
}

/** Sum every numeric value in an install bucket. The bucket is keyed by
 *  install command form; the total across keys is the formula's headline
 *  install count for that window. */
function sumBucket(bucket: unknown, window: string): number {
  if (!bucket || typeof bucket !== "object") {
    throw new Error(`brew: ${window} bucket missing or non-object`);
  }
  let total = 0;
  for (const [, value] of Object.entries(bucket as Record<string, unknown>)) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`brew: ${window} entry is not a non-negative finite number`);
    }
    total += n;
  }
  return Math.round(total);
}
