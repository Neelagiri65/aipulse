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
};

const PYPISTATS_BASE = "https://pypistats.org/api/packages";
const USER_AGENT = "aipulse/1.0 (+https://aipulse-pi.vercel.app)";

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

  for (const pkg of packages) {
    try {
      counters[pkg] = await fetchPyPiRecent(pkg, fetchImpl);
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

/** Hit pypistats.org for one package. Throws on non-2xx or malformed body. */
export async function fetchPyPiRecent(
  pkg: string,
  fetchImpl: typeof fetch,
): Promise<PackageCounter> {
  const url = `${PYPISTATS_BASE}/${encodeURIComponent(pkg)}/recent`;
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`pypistats ${pkg} HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  return parsePyPiCounter(body);
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
