/**
 * crates.io ingest — fetches download counters for the tracked Rust AI/ML
 * crates and overwrites the `pkg:crates:latest` blob.
 *
 * Source of truth: crates.io/api/v1/crates/{name}
 *   Response shape: { crate: { downloads, recent_downloads, ... }, ... }
 *
 * crates.io is the official Rust package registry's own API — first-party
 * provenance. Two counters are published per crate:
 *   - `downloads`          → all-time total
 *   - `recent_downloads`   → rolling last 90 days
 * The registry does NOT expose last-day or last-week windows, so we only
 * populate {last90d, allTime} and leave the PyPI/npm windows undefined.
 * Synthesising a 7-day count by dividing 90d/13 would be a lie — readers
 * surface "—" for missing fields per the PackageCounter contract.
 *
 * Rate-limit etiquette: crates.io requires a User-Agent identifying the
 * caller + contact (see https://crates.io/data-access). Anonymous requests
 * without UA are blocked. We send `aipulse/1.0 (+https://gawk.dev)`.
 *
 * Partial-failure policy mirrors PyPI + npm: ok:true iff ≥ 1 crate
 * succeeded, ok:false preserves the previous blob untouched.
 */

import {
  writeLatest,
  type PackageCounter,
  type PackageLatest,
} from "@/lib/data/pkg-store";

export const CRATES_SOURCE_ID = "crates";

export const CRATES_TRACKED_PACKAGES = [
  "candle-core",
  "burn",
  "tch",
  "ort",
] as const;

export type CratesIngestResult = {
  ok: boolean;
  written: number;
  failures: Array<{ pkg: string; message: string }>;
  counters: Record<string, PackageCounter>;
  fetchedAt: string;
};

export type CratesIngestOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  packages?: readonly string[];
};

const CRATES_BASE = "https://crates.io/api/v1/crates";
const USER_AGENT = "aipulse/1.0 (+https://gawk.dev)";

export async function runCratesIngest(
  opts: CratesIngestOptions = {},
): Promise<CratesIngestResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const packages = opts.packages ?? CRATES_TRACKED_PACKAGES;

  const counters: Record<string, PackageCounter> = {};
  const failures: Array<{ pkg: string; message: string }> = [];

  for (const pkg of packages) {
    try {
      counters[pkg] = await fetchCratesCounter(pkg, fetchImpl);
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
      source: CRATES_SOURCE_ID,
      fetchedAt,
      counters,
      failures,
    };
    await writeLatest(blob);
  }

  return { ok, written, failures, counters, fetchedAt };
}

/** Hit crates.io for one crate. Throws on non-2xx or malformed body. */
export async function fetchCratesCounter(
  pkg: string,
  fetchImpl: typeof fetch,
): Promise<PackageCounter> {
  const url = `${CRATES_BASE}/${encodeURIComponent(pkg)}`;
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`crates ${pkg} HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  return parseCratesCounter(body);
}

/** Parse a crates.io /crates/{name} body. Pure — no I/O. */
export function parseCratesCounter(body: unknown): PackageCounter {
  if (!body || typeof body !== "object") {
    throw new Error("crates: non-object body");
  }
  const o = body as Record<string, unknown>;
  const crate = o.crate;
  if (!crate || typeof crate !== "object") {
    throw new Error("crates: missing crate field");
  }
  const c = crate as Record<string, unknown>;
  const allTime = toCount(c.downloads, "downloads");
  const last90d = toCount(c.recent_downloads, "recent_downloads");
  return { last90d, allTime };
}

function toCount(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`crates: ${field} is not a non-negative finite number`);
  }
  return Math.round(n);
}
