/**
 * PyPI ingest — fetches rolling download counters for the tracked AI-SDK
 * packages from pypistats.org and overwrites the `pkg:pypi:latest` blob.
 *
 * Source of truth: pypistats.org/api/packages/{pkg}/recent
 *   Response shape: { data: { last_day, last_week, last_month }, package, type }
 *
 * pypistats.org is a third-party aggregator mirroring official PyPI download
 * logs (BigQuery pypi.downloads). Provenance: not PyPI itself, same class as
 * ecosyste.ms. Verified live 2026-04-21 — the data-sources.ts entry and
 * caveat carry the contract.
 *
 * Partial-failure policy: if any package returned a counter, we write the
 * blob with whatever we have and list the failures — a partial snapshot is
 * an honest gap. If every package failed, we return ok:false and leave the
 * previous blob untouched so the last known-good numbers persist on the
 * dashboard rather than flipping to zero.
 *
 * No editorial curation of the package list — they are the seven SDKs /
 * libraries that together cover the Anthropic, OpenAI, HuggingFace, and
 * LangChain ecosystems. Adding or removing a package is a code change
 * under Auditor review, not a config flag.
 */

import {
  writeLatest,
  type PackageCounter,
  type PackageLatest,
} from "@/lib/data/pkg-store";

export const PYPI_SOURCE_ID = "pypi";

export const PYPI_TRACKED_PACKAGES = [
  "anthropic",
  "openai",
  "langchain",
  "transformers",
  "torch",
  "huggingface-hub",
  "diffusers",
] as const;

export type PyPiIngestResult = {
  ok: boolean;
  /** Number of packages whose counters were fetched successfully. */
  written: number;
  /** Package name + error message for each failed fetch. */
  failures: Array<{ pkg: string; message: string }>;
  /** Keyed by package name — the counters that were fetched. */
  counters: Record<string, PackageCounter>;
  /** ISO of the fetch run. */
  fetchedAt: string;
};

export type PyPiIngestOptions = {
  /** Override the fetch implementation (tests). */
  fetchImpl?: typeof fetch;
  /** Override "now" (tests). */
  now?: () => Date;
  /** Override the tracked package list (tests). */
  packages?: readonly string[];
  /** Override the inter-request wait (tests). Milliseconds. */
  sleepImpl?: (ms: number) => Promise<void>;
};

const PYPISTATS_BASE = "https://pypistats.org/api/packages";
const USER_AGENT = "aipulse/1.0 (+https://gawk.dev)";

/**
 * Wait between package requests, and retry once on a 429.
 *
 * pypistats.org rate-limits, and this ingest fired all seven packages
 * back-to-back with no pause and no retry. A refused package is not written,
 * and `writeLatest` OVERWRITES the blob — so a transient 429 erased that
 * package's last-known counter, and the daily snapshot that later read the
 * blob simply had no row for it. The hole in the 30-day series is permanent.
 *
 * The damage was measurable on prod: PyPI packages held 10-21 of 30 days
 * (pypi:anthropic's newest figure was nine days old) while npm, crates,
 * docker, brew and vscode — whose upstreams do not rate-limit — all held 29
 * of 30.
 *
 * 1.5s between calls puts seven packages at ~9s, comfortably inside the cron
 * budget, and pypistats' published etiquette asks for exactly this rather than
 * a burst. The single retry honours `Retry-After` when the server sends one.
 */
const INTER_REQUEST_MS = 1_500;
const RETRY_CAP_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch every tracked package's recent counters, persist the latest blob
 * when at least one succeeded, and return the per-package outcome.
 */
export async function runPyPiIngest(
  opts: PyPiIngestOptions = {},
): Promise<PyPiIngestResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const packages = opts.packages ?? PYPI_TRACKED_PACKAGES;

  const counters: Record<string, PackageCounter> = {};
  const failures: Array<{ pkg: string; message: string }> = [];

  const sleepImpl = opts.sleepImpl ?? sleep;

  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];
    // Pace from the second request on — the first has nothing to wait behind.
    if (i > 0) await sleepImpl(INTER_REQUEST_MS);
    try {
      counters[pkg] = await fetchPyPiRecent(pkg, fetchImpl, sleepImpl);
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
      source: PYPI_SOURCE_ID,
      fetchedAt,
      counters,
      failures,
    };
    await writeLatest(blob);
  }

  return { ok, written, failures, counters, fetchedAt };
}

/**
 * Hit pypistats.org for one package. Throws on non-2xx or malformed body.
 *
 * Retries ONCE on 429, because a refused package does not merely go missing
 * for this run — `writeLatest` overwrites the blob, so it loses its last-known
 * counter and drops out of that day's snapshot for good.
 */
export async function fetchPyPiRecent(
  pkg: string,
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void> = sleep,
): Promise<PackageCounter> {
  const url = `${PYPISTATS_BASE}/${encodeURIComponent(pkg)}/recent`;
  const request = () =>
    fetchImpl(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

  let res = await request();
  if (res.status === 429) {
    await sleepImpl(retryAfterMs(res.headers?.get?.("retry-after") ?? null));
    res = await request();
  }
  if (!res.ok) {
    throw new Error(`pypistats ${pkg} HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  return parsePyPiCounter(body);
}

/**
 * How long to wait after a 429. `Retry-After` is seconds (or an HTTP date);
 * anything absent, unparseable or absurd falls back to the inter-request
 * pause, and everything is capped so one hostile header cannot stall the cron.
 */
export function retryAfterMs(header: string | null): number {
  if (!header) return INTER_REQUEST_MS;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, RETRY_CAP_MS);
  }
  const at = Date.parse(header);
  if (!Number.isNaN(at)) {
    return Math.min(Math.max(at - Date.now(), 0), RETRY_CAP_MS);
  }
  return INTER_REQUEST_MS;
}

/** Parse a pypistats.org /recent body. Pure — no I/O. */
export function parsePyPiCounter(body: unknown): PackageCounter {
  if (!body || typeof body !== "object") {
    throw new Error("pypistats: non-object body");
  }
  const o = body as Record<string, unknown>;
  const data = o.data;
  if (!data || typeof data !== "object") {
    throw new Error("pypistats: missing data field");
  }
  const d = data as Record<string, unknown>;
  const lastDay = toCount(d.last_day, "last_day");
  const lastWeek = toCount(d.last_week, "last_week");
  const lastMonth = toCount(d.last_month, "last_month");
  return { lastDay, lastWeek, lastMonth };
}

function toCount(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`pypistats: ${field} is not a non-negative finite number`);
  }
  return Math.round(n);
}
