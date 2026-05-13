/**
 * Source health probe — deterministic endpoint validator.
 *
 * Reads ALL_SOURCES from data-sources.ts, hits each endpoint, validates
 * response shape + sanity range, writes a timestamped health record to
 * data/source-health.json. Zero LLM calls.
 *
 * Usage:
 *   npx tsx scripts/probe-sources.ts          # probe all sources
 *   npx tsx scripts/probe-sources.ts --id gh-events   # probe one source
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HEALTH_FILE = resolve(ROOT, "data/source-health.json");
const HISTORY_FILE = resolve(ROOT, "data/source-health-history.json");

type ProbeStatus = "healthy" | "degraded" | "down" | "skipped" | "unknown";

type SanityResult = {
  passed: boolean;
  observedValue?: number;
  expectedMin?: number;
  expectedMax?: number;
  unit?: string;
};

type ProbeResult = {
  sourceId: string;
  sourceName: string;
  timestamp: string;
  status: ProbeStatus;
  httpStatus?: number;
  responseTimeMs?: number;
  sanityCheck?: SanityResult;
  shapeFingerprint?: string;
  shapeDrift?: boolean;
  itemCount?: number;
  error?: string;
};

type HealthSnapshot = {
  generatedAt: string;
  totalSources: number;
  healthy: number;
  degraded: number;
  down: number;
  skipped: number;
  unknown: number;
  results: ProbeResult[];
};

type HistoryEntry = {
  sourceId: string;
  timestamp: string;
  status: ProbeStatus;
  shapeFingerprint?: string;
  httpStatus?: number;
  responseTimeMs?: number;
  sanityPassed?: boolean;
  observedValue?: number;
};

type HealthHistory = {
  maxEntriesPerSource: number;
  sources: Record<string, HistoryEntry[]>;
};

const SAMPLE_PARAMS: Record<string, string> = {
  "gh-contents": "https://api.github.com/repos/anthropics/claude-code/contents/CLAUDE.md",
  "gh-code-search": "https://api.github.com/search/code?q=filename:CLAUDE.md&per_page=1",
  "gh-repo-search-topics": "https://api.github.com/search/repositories?q=topic:claude&sort=stars&order=desc&per_page=1",
  "ecosystems-npm-dependents": "https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages/@anthropic-ai/sdk/dependent_packages?per_page=1",
  "pypi-downloads": "https://pypistats.org/api/packages/anthropic/recent",
  "npm-downloads": "https://api.npmjs.org/downloads/point/last-week/openai",
  "crates-downloads": "https://crates.io/api/v1/crates/candle-core",
  "docker-hub-pulls": "https://hub.docker.com/v2/repositories/ollama/ollama",
  "homebrew-installs": "https://formulae.brew.sh/api/formula/ollama.json",
  "github-repo-meta": "https://api.github.com/repos/anthropics/claude-code",
  "gharchive": "", // skip — requires downloading large gzip files
  "gh-repo-events-labs": "https://api.github.com/repos/anthropics/claude-code/events?per_page=1",
};

function resolveUrl(source: { id: string; apiUrl?: string }): string | null {
  if (SAMPLE_PARAMS[source.id] !== undefined) {
    return SAMPLE_PARAMS[source.id] || null;
  }
  return source.apiUrl ?? null;
}

function getAuthHeaders(auth: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "gawk.dev-source-probe/1.0",
    Accept: "application/json",
  };
  if (auth === "github-token") {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function fingerprint(data: unknown): string {
  if (Array.isArray(data)) {
    const sample = data[0];
    const keys = sample && typeof sample === "object" ? Object.keys(sample).sort().join(",") : "[]";
    return `array[${data.length}]{${keys}}`;
  }
  if (data && typeof data === "object") {
    const keys = Object.keys(data).sort();
    const shape: string[] = [];
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) shape.push(`${k}:array[${v.length}]`);
      else if (v && typeof v === "object") shape.push(`${k}:object`);
      else shape.push(`${k}:${typeof v}`);
    }
    return `{${shape.join(",")}}`;
  }
  return String(typeof data);
}

function extractCountable(data: unknown, sourceId: string): number | undefined {
  if (Array.isArray(data)) return data.length;
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;

  if (sourceId.startsWith("gh-") && Array.isArray(obj.items)) return obj.items.length;
  if (obj.components && Array.isArray(obj.components)) return (obj.components as unknown[]).length;
  if (obj.rows && Array.isArray(obj.rows)) return (obj.rows as unknown[]).length;
  if (obj.hits && Array.isArray(obj.hits)) return (obj.hits as unknown[]).length;
  if (obj.incidents && Array.isArray(obj.incidents)) return (obj.incidents as unknown[]).length;

  if (sourceId === "pypi-downloads" && obj.data) {
    const d = obj.data as Record<string, unknown>;
    if (typeof d.last_month === "number") return d.last_month;
  }
  if (sourceId === "npm-downloads" && typeof obj.downloads === "number") return obj.downloads;
  if (sourceId === "crates-downloads" && obj.crate) {
    const c = obj.crate as Record<string, unknown>;
    if (typeof c.recent_downloads === "number") return c.recent_downloads;
  }
  if (sourceId === "docker-hub-pulls" && typeof obj.pull_count === "number") return obj.pull_count;
  if (sourceId === "homebrew-installs" && obj.analytics) {
    const a = obj.analytics as Record<string, unknown>;
    const inst = a.install as Record<string, unknown> | undefined;
    if (inst) {
      const d90 = inst["90d"] as Record<string, number> | undefined;
      if (d90) return Object.values(d90).reduce((s, v) => s + v, 0);
    }
  }
  if (sourceId === "vscode-marketplace" && obj.results && Array.isArray(obj.results)) {
    const exts = (obj.results as Array<Record<string, unknown>>)[0]?.extensions;
    if (Array.isArray(exts)) return exts.length;
  }

  return undefined;
}

function checkSanity(
  observedValue: number | undefined,
  sanity: { expectedMin?: number; expectedMax?: number; unit?: string },
): SanityResult | undefined {
  if (observedValue === undefined) return undefined;
  if (sanity.expectedMin === undefined && sanity.expectedMax === undefined) return undefined;
  const passed =
    (sanity.expectedMin === undefined || observedValue >= sanity.expectedMin) &&
    (sanity.expectedMax === undefined || observedValue <= sanity.expectedMax);
  return {
    passed,
    observedValue,
    expectedMin: sanity.expectedMin,
    expectedMax: sanity.expectedMax,
    unit: sanity.unit,
  };
}

async function probeVscodeMarketplace(headers: Record<string, string>): Promise<Response> {
  const body = {
    filters: [
      {
        criteria: [
          { filterType: 7, value: "GitHub.copilot" },
        ],
        pageNumber: 1,
        pageSize: 1,
      },
    ],
    flags: 914,
  };
  return fetch("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Accept: "application/json;api-version=7.1-preview.1" },
    body: JSON.stringify(body),
  });
}

async function probeSource(source: {
  id: string;
  name: string;
  apiUrl?: string;
  responseFormat?: string;
  auth: string;
  sanityCheck: { expectedMin?: number; expectedMax?: number; unit?: string; description: string };
}, previousFingerprint?: string): Promise<ProbeResult> {
  const timestamp = new Date().toISOString();
  const base: Partial<ProbeResult> = { sourceId: source.id, sourceName: source.name, timestamp };

  if (source.id === "vscode-marketplace") {
    const headers = getAuthHeaders("none");
    try {
      const start = Date.now();
      const resp = await probeVscodeMarketplace(headers);
      const responseTimeMs = Date.now() - start;
      if (!resp.ok) {
        return { ...base, status: "down", httpStatus: resp.status, responseTimeMs, error: `HTTP ${resp.status}` } as ProbeResult;
      }
      const data = await resp.json();
      const fp = fingerprint(data);
      const count = extractCountable(data, source.id);
      const sanity = checkSanity(count, source.sanityCheck);
      const drift = previousFingerprint ? fp !== previousFingerprint : undefined;
      const status: ProbeStatus = sanity && !sanity.passed ? "degraded" : "healthy";
      return { ...base, status, httpStatus: 200, responseTimeMs, shapeFingerprint: fp, shapeDrift: drift, itemCount: count, sanityCheck: sanity } as ProbeResult;
    } catch (err) {
      return { ...base, status: "down", error: String(err) } as ProbeResult;
    }
  }

  const url = resolveUrl(source);
  if (!url) {
    return { ...base, status: "skipped", error: "No direct URL (template-based or large download)" } as ProbeResult;
  }

  const headers = getAuthHeaders(source.auth);
  if (source.responseFormat === "rss") {
    headers["Accept"] = "application/atom+xml, application/rss+xml, application/xml, text/xml";
  }

  try {
    const start = Date.now();
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    const responseTimeMs = Date.now() - start;

    if (!resp.ok) {
      return { ...base, status: "down", httpStatus: resp.status, responseTimeMs, error: `HTTP ${resp.status}` } as ProbeResult;
    }

    const contentType = resp.headers.get("content-type") ?? "";
    let data: unknown;
    let fp: string;

    if (source.responseFormat === "rss" || contentType.includes("xml") || contentType.includes("atom")) {
      const text = await resp.text();
      const entryCount = (text.match(/<entry[\s>]/g) || []).length;
      const itemCount = (text.match(/<item[\s>]/g) || []).length;
      const count = Math.max(entryCount, itemCount);
      fp = `rss[${count}]`;
      const sanity = checkSanity(count, source.sanityCheck);
      const drift = previousFingerprint ? fp !== previousFingerprint : undefined;
      const status: ProbeStatus = sanity && !sanity.passed ? "degraded" : "healthy";
      return { ...base, status, httpStatus: 200, responseTimeMs, shapeFingerprint: fp, shapeDrift: drift, itemCount: count, sanityCheck: sanity } as ProbeResult;
    }

    const text = await resp.text();
    try {
      data = JSON.parse(text);
    } catch {
      return { ...base, status: "degraded", httpStatus: 200, responseTimeMs, error: "Response not parseable as JSON" } as ProbeResult;
    }

    fp = fingerprint(data);
    const count = extractCountable(data, source.id);
    const sanity = checkSanity(count, source.sanityCheck);
    const drift = previousFingerprint ? fp !== previousFingerprint : undefined;
    const status: ProbeStatus = sanity && !sanity.passed ? "degraded" : "healthy";
    return { ...base, status, httpStatus: 200, responseTimeMs, shapeFingerprint: fp, shapeDrift: drift, itemCount: count, sanityCheck: sanity } as ProbeResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...base, status: "down", error: msg } as ProbeResult;
  }
}

function loadPreviousFingerprints(): Record<string, string> {
  if (!existsSync(HEALTH_FILE)) return {};
  try {
    const snap: HealthSnapshot = JSON.parse(readFileSync(HEALTH_FILE, "utf-8"));
    const map: Record<string, string> = {};
    for (const r of snap.results) {
      if (r.shapeFingerprint) map[r.sourceId] = r.shapeFingerprint;
    }
    return map;
  } catch {
    return {};
  }
}

function appendHistory(results: ProbeResult[]): void {
  let history: HealthHistory;
  if (existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
    } catch {
      history = { maxEntriesPerSource: 30, sources: {} };
    }
  } else {
    history = { maxEntriesPerSource: 30, sources: {} };
  }

  for (const r of results) {
    if (r.status === "skipped") continue;
    const entry: HistoryEntry = {
      sourceId: r.sourceId,
      timestamp: r.timestamp,
      status: r.status,
      shapeFingerprint: r.shapeFingerprint,
      httpStatus: r.httpStatus,
      responseTimeMs: r.responseTimeMs,
      sanityPassed: r.sanityCheck?.passed,
      observedValue: r.sanityCheck?.observedValue,
    };
    if (!history.sources[r.sourceId]) history.sources[r.sourceId] = [];
    history.sources[r.sourceId].push(entry);
    if (history.sources[r.sourceId].length > history.maxEntriesPerSource) {
      history.sources[r.sourceId] = history.sources[r.sourceId].slice(-history.maxEntriesPerSource);
    }
  }

  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

async function main() {
  const { ALL_SOURCES } = await import("../src/lib/data-sources.js");

  const filterId = process.argv.find((a, i) => process.argv[i - 1] === "--id");

  const sources = filterId
    ? ALL_SOURCES.filter((s: { id: string }) => s.id === filterId)
    : [...ALL_SOURCES];

  if (sources.length === 0) {
    console.error(`No source found with id: ${filterId}`);
    process.exit(1);
  }

  const previousFps = loadPreviousFingerprints();

  console.log(`\n  Source Health Probe — ${new Date().toISOString()}`);
  console.log(`  ${"─".repeat(50)}\n`);

  const results: ProbeResult[] = [];

  for (const source of sources) {
    const prevFp = previousFps[source.id];
    process.stdout.write(`  [${source.id.padEnd(28)}] `);
    const result = await probeSource(source, prevFp);
    results.push(result);

    const icon = {
      healthy: "✓",
      degraded: "⚠",
      down: "✗",
      skipped: "○",
      unknown: "?",
    }[result.status];

    let detail = `${icon} ${result.status.toUpperCase()}`;
    if (result.responseTimeMs) detail += ` (${result.responseTimeMs}ms)`;
    if (result.shapeDrift) detail += " [SHAPE DRIFT]";
    if (result.sanityCheck && !result.sanityCheck.passed) {
      detail += ` [SANITY FAIL: ${result.sanityCheck.observedValue} not in ${result.sanityCheck.expectedMin ?? "?"}–${result.sanityCheck.expectedMax ?? "?"}]`;
    }
    if (result.error && result.status !== "skipped") detail += ` — ${result.error}`;
    if (result.status === "skipped") detail += ` — ${result.error}`;
    console.log(detail);

    // courtesy delay between probes
    await new Promise((r) => setTimeout(r, 200));
  }

  const snapshot: HealthSnapshot = {
    generatedAt: new Date().toISOString(),
    totalSources: results.length,
    healthy: results.filter((r) => r.status === "healthy").length,
    degraded: results.filter((r) => r.status === "degraded").length,
    down: results.filter((r) => r.status === "down").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    unknown: results.filter((r) => r.status === "unknown").length,
    results,
  };

  writeFileSync(HEALTH_FILE, JSON.stringify(snapshot, null, 2));
  appendHistory(results);

  console.log(`\n  ${"─".repeat(50)}`);
  console.log(`  Summary: ${snapshot.healthy} healthy, ${snapshot.degraded} degraded, ${snapshot.down} down, ${snapshot.skipped} skipped`);
  console.log(`  Written: ${HEALTH_FILE}`);
  console.log(`  History: ${HISTORY_FILE}\n`);

  const hasFailures = snapshot.degraded > 0 || snapshot.down > 0;
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error("Probe failed:", err);
  process.exit(2);
});
