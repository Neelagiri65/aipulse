/**
 * VS Code Marketplace ingest — fetches cumulative install counts for the
 * tracked AI coding-assistant extensions and overwrites
 * `pkg:vscode:latest` in Upstash.
 *
 * Source of truth:
 *   POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery
 *   Headers: Accept: application/json;api-version=3.0-preview.1
 *   Body:    { filters: [{ criteria: [{ filterType: 7, value: "{ext}" }, ...] }], flags: 914 }
 *
 * Response shape (subset we read):
 *   { results: [{ extensions: [{
 *       publisher: { publisherName },
 *       extensionName,
 *       statistics: [{ statisticName: "install" | ..., value: number }, ...]
 *   }, ...] }] }
 *
 * Microsoft's catalogue is a first-party source, but the `_apis/public/gallery/...`
 * URL is empirically reachable rather than formally documented as a public API
 * contract. Same surface the marketplace web UI itself calls — verified live
 * via the S37 probe + present commit's verification.
 *
 * Partial-failure policy: if any extension returned an `install` counter,
 * we write the blob with whatever we have and list the failures. If the
 * batched POST itself errors (network / non-2xx), we return ok:false and
 * leave the previous blob untouched so the dashboard keeps last-known
 * numbers rather than flipping to zero.
 *
 * Slate is a code change under Auditor review per CLAUDE.md, not a config flag.
 */

import {
  writeLatest,
  type PackageCounter,
  type PackageLatest,
} from "@/lib/data/pkg-store";

export const VSCODE_SOURCE_ID = "vscode";

/**
 * Six tracked AI coding-assistant extensions. Slug format is
 * `{publisher}.{extensionName}` — that's the canonical Marketplace id used
 * by the install command + the URL slug + the API filter value.
 */
export const VSCODE_TRACKED_EXTENSIONS = [
  "GitHub.copilot",
  "Continue.continue",
  "sourcegraph.cody-ai",
  "Codeium.codeium",
  "saoudrizwan.claude-dev",
  "TabNine.tabnine-vscode",
] as const;

export type VSCodeIngestResult = {
  ok: boolean;
  /** Number of extensions whose install counter was written successfully. */
  written: number;
  /** Extension id + error message for each missing extension. */
  failures: Array<{ pkg: string; message: string }>;
  /** Keyed by extension id — counters that were ingested. */
  counters: Record<string, PackageCounter>;
  /** ISO of the fetch run. */
  fetchedAt: string;
};

export type VSCodeIngestOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  extensions?: readonly string[];
};

const MARKETPLACE_ENDPOINT =
  "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";
const ACCEPT_HEADER = "application/json;api-version=3.0-preview.1";
const USER_AGENT = "aipulse/1.0 (+https://gawk.dev)";

/**
 * `flags: 914` is the bitmask the marketplace web client uses for an
 * extensionquery — empirically returns the `statistics` block we need
 * (install / updateCount / averagerating / trendingdaily) without
 * pulling unnecessary VSIX payload metadata. Stable across the S37 probe
 * and present-day verification. Not formally documented; an upstream
 * change would surface as `statistics: undefined` per extension and
 * fall through to the per-extension failure path.
 */
const FLAGS = 914;

export async function runVSCodeIngest(
  opts: VSCodeIngestOptions = {},
): Promise<VSCodeIngestResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const extensions = opts.extensions ?? VSCODE_TRACKED_EXTENSIONS;
  const fetchedAt = now().toISOString();

  const counters: Record<string, PackageCounter> = {};
  const failures: Array<{ pkg: string; message: string }> = [];

  let extensionsByKey: Map<string, ParsedExtension>;
  try {
    extensionsByKey = await fetchExtensionStats(extensions, fetchImpl);
  } catch (e) {
    // Whole-batch failure (network down, 5xx, parse error). Mark every
    // tracked extension as a failure so the caller can see the run was
    // attempted; do NOT overwrite the latest blob — readers keep the
    // previous successful run on the dashboard.
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      written: 0,
      failures: extensions.map((pkg) => ({ pkg, message })),
      counters: {},
      fetchedAt,
    };
  }

  for (const ext of extensions) {
    const found = extensionsByKey.get(ext.toLowerCase());
    if (!found) {
      failures.push({
        pkg: ext,
        message: "marketplace returned no row for this extension",
      });
      continue;
    }
    const installs = found.installs;
    if (installs === null) {
      failures.push({
        pkg: ext,
        message: "marketplace row missing install statistic",
      });
      continue;
    }
    counters[ext] = { allTime: installs };
  }

  const written = Object.keys(counters).length;
  const ok = written > 0;

  if (ok) {
    const blob: PackageLatest = {
      source: VSCODE_SOURCE_ID,
      fetchedAt,
      counters,
      failures,
    };
    await writeLatest(blob);
  }

  return { ok, written, failures, counters, fetchedAt };
}

type ParsedExtension = {
  /** "{publisher}.{extensionName}", lowercased — the lookup key. */
  key: string;
  installs: number | null;
};

export async function fetchExtensionStats(
  extensions: readonly string[],
  fetchImpl: typeof fetch,
): Promise<Map<string, ParsedExtension>> {
  const body = JSON.stringify({
    filters: [
      {
        criteria: extensions.map((value) => ({ filterType: 7, value })),
      },
    ],
    flags: FLAGS,
  });
  const res = await fetchImpl(MARKETPLACE_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: ACCEPT_HEADER,
      "Content-Type": "application/json",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`vscode-marketplace HTTP ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return parseExtensionQueryResponse(json);
}

/**
 * Parse the `extensionquery` response into a (lowercased-key → installs)
 * map. Pure — no I/O. Defensive against the catalogue's tendency to omit
 * fields silently: a row missing `statistics` or the `install` stat is
 * recorded with `installs: null` rather than throwing for the whole batch.
 */
export function parseExtensionQueryResponse(
  body: unknown,
): Map<string, ParsedExtension> {
  const out = new Map<string, ParsedExtension>();
  if (!body || typeof body !== "object") {
    throw new Error("vscode-marketplace: non-object body");
  }
  const o = body as Record<string, unknown>;
  const results = o.results;
  if (!Array.isArray(results)) {
    throw new Error("vscode-marketplace: results not an array");
  }
  for (const result of results) {
    if (!result || typeof result !== "object") continue;
    const exts = (result as Record<string, unknown>).extensions;
    if (!Array.isArray(exts)) continue;
    for (const e of exts) {
      const parsed = parseExtensionRow(e);
      if (parsed) out.set(parsed.key, parsed);
    }
  }
  return out;
}

function parseExtensionRow(value: unknown): ParsedExtension | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  const publisher = e.publisher as
    | { publisherName?: unknown }
    | null
    | undefined;
  const publisherName =
    publisher && typeof publisher.publisherName === "string"
      ? publisher.publisherName
      : null;
  const extensionName =
    typeof e.extensionName === "string" ? e.extensionName : null;
  if (!publisherName || !extensionName) return null;
  const key = `${publisherName}.${extensionName}`.toLowerCase();
  const stats = e.statistics;
  if (!Array.isArray(stats)) return { key, installs: null };
  let installs: number | null = null;
  for (const s of stats) {
    if (!s || typeof s !== "object") continue;
    const stat = s as Record<string, unknown>;
    if (stat.statisticName === "install") {
      const v = typeof stat.value === "number" ? stat.value : Number(stat.value);
      if (Number.isFinite(v) && v >= 0) installs = Math.round(v);
      break;
    }
  }
  return { key, installs };
}
