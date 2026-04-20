/**
 * Chatbot Arena benchmarks — ingest orchestration.
 *
 * Two fetchers against the HuggingFace Datasets Server REST API:
 *   1. fetchLatestSnapshot — `config=text, split=latest`. Paginates until
 *      20 rows with `category === "overall"` are collected (or 5 pages
 *      exhausted). Returns the top 20 sorted by `rank` asc.
 *   2. fetchPreviousSnapshot(latestDate) — `config=text, split=full`. The
 *      full split is ordered oldest-first, so we seek from the tail
 *      backwards: fetch `num_rows_total - N` forward to find the newest
 *      `leaderboard_publish_date` strictly less than `latestDate`, then
 *      gather all `category === "overall"` rows for that prev date.
 *
 * Pure-logic helpers (parseHfRow, selectTop20, computeDeltas, buildPayload,
 * runSanityCheck) live in `benchmarks-lmarena.ts` and are fully unit-tested.
 *
 * runIngest never throws — on any failure it returns
 *   { ok: false, reason, error }
 * so the caller (cron script or API route) can degrade gracefully.
 */

// Relative + explicit `.ts` extension so the GH-Action ingest script
// (run via `node --experimental-strip-types`, which requires explicit
// extensions) resolves this module. tsconfig's `moduleResolution: bundler`
// + Next.js + Vitest also accept `.ts` extensions, so nothing else
// breaks.
import {
  type ArenaRow,
  type BenchmarksPayload,
  buildPayload,
  isOverall,
  parseHfRow,
  selectTop20,
} from "./benchmarks-lmarena.ts";

const HF_BASE = "https://datasets-server.huggingface.co/rows";
const DATASET = "lmarena-ai/leaderboard-dataset";
const CONFIG = "text";
const PAGE_LENGTH = 100;
const LATEST_MAX_PAGES = 5;
const PREV_TAIL_ROWS = 3000;
const FETCH_TIMEOUT_MS = 10_000;

type HfRowsPage = {
  rows: Array<{ row: unknown }>;
  num_rows_total: number;
};

async function fetchPage(
  split: "latest" | "full",
  offset: number,
  length: number,
): Promise<HfRowsPage> {
  const url = new URL(HF_BASE);
  url.searchParams.set("dataset", DATASET);
  url.searchParams.set("config", CONFIG);
  url.searchParams.set("split", split);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("length", String(length));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HF ${split} HTTP ${res.status} at offset ${offset}`);
    }
    const body = (await res.json()) as HfRowsPage;
    if (!body || !Array.isArray(body.rows)) {
      throw new Error(`HF ${split} response missing rows[] at offset ${offset}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLatestSnapshot(): Promise<ArenaRow[]> {
  const collected: ArenaRow[] = [];
  for (let page = 0; page < LATEST_MAX_PAGES; page++) {
    const body = await fetchPage("latest", page * PAGE_LENGTH, PAGE_LENGTH);
    for (const entry of body.rows) {
      const parsed = parseHfRow(entry.row);
      if (parsed && isOverall(parsed)) collected.push(parsed);
    }
    // Early exit: once we have 20+ overall rows in rank ≤ 20 range, stop.
    const overallRanked = collected.filter((r) => r.rank >= 1 && r.rank <= 20);
    if (overallRanked.length >= 20) break;
    if (body.rows.length < PAGE_LENGTH) break; // end of split
  }
  return selectTop20(collected);
}

/**
 * Seek the most-recent publish date strictly less than `latestDate` by
 * scanning backwards through the tail of `split=full`. Returns all
 * `category === "overall"` rows for that previous date. Returns null
 * when no earlier date exists (e.g. first snapshot ever ingested).
 */
export async function fetchPreviousSnapshot(
  latestDate: string,
): Promise<ArenaRow[] | null> {
  // Probe total to locate the tail.
  const probe = await fetchPage("full", 0, 1);
  const total = probe.num_rows_total;
  if (!Number.isFinite(total) || total <= 0) return null;

  const tailStart = Math.max(0, total - PREV_TAIL_ROWS);
  const candidates: ArenaRow[] = [];

  for (
    let offset = tailStart;
    offset < total;
    offset += PAGE_LENGTH
  ) {
    const body = await fetchPage("full", offset, PAGE_LENGTH);
    for (const entry of body.rows) {
      const parsed = parseHfRow(entry.row);
      if (parsed && isOverall(parsed)) candidates.push(parsed);
    }
    if (body.rows.length < PAGE_LENGTH) break;
  }

  if (candidates.length === 0) return null;

  // Previous publish date = newest date < latestDate.
  const dates = new Set<string>();
  for (const c of candidates) {
    if (c.leaderboardPublishDate < latestDate) dates.add(c.leaderboardPublishDate);
  }
  if (dates.size === 0) return null;
  const prevDate = [...dates].sort().pop()!;

  const prevRows = candidates
    .filter((c) => c.leaderboardPublishDate === prevDate)
    .filter((r) => r.rank >= 1 && r.rank <= 50) // allow slack; selectTop20 trims
    .slice();
  prevRows.sort((a, b) => a.rank - b.rank);
  return prevRows.slice(0, 20);
}

export type IngestResult =
  | { ok: true; payload: BenchmarksPayload }
  | { ok: false; reason: string; error?: string };

export async function runIngest(opts: {
  now?: () => Date;
} = {}): Promise<IngestResult> {
  const now = (opts.now ?? (() => new Date()))();
  const fetchedAt = now.toISOString();

  let current: ArenaRow[];
  try {
    current = await fetchLatestSnapshot();
  } catch (err) {
    return {
      ok: false,
      reason: "latest_fetch_failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (current.length === 0) {
    return { ok: false, reason: "no_current_rows" };
  }

  const latestDate = current[0].leaderboardPublishDate;

  let previous: ArenaRow[] | null = null;
  try {
    previous = await fetchPreviousSnapshot(latestDate);
  } catch (err) {
    // Non-fatal: degrade to all-NEW by passing null.
    console.warn(
      "[benchmarks] previous-snapshot fetch failed, degrading to NEW:",
      err instanceof Error ? err.message : err,
    );
    previous = null;
  }

  const payload = buildPayload(current, previous, { fetchedAt });
  return { ok: true, payload };
}
