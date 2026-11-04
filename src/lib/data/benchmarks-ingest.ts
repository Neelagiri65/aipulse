/**
 * Chatbot Arena benchmarks — ingest orchestration.
 *
 * Two fetchers against the HuggingFace Datasets Server REST API:
 *   1. fetchLatestSnapshot — `config=text, split=latest`. Paginates until
 *      20 rows with `category === "overall"` are collected (or 5 pages
 *      exhausted). Returns the top 20 sorted by `rank` asc.
 *
 * The PREVIOUS snapshot (what deltas compare against) is NOT fetched from
 * HF. It is the top 20 this repo committed for the previous publish date,
 * carried forward by `choosePrevious` and stored in
 * `data/benchmarks/lmarena-previous.json`.
 *
 * Why: until 2026-11-04 it was read from the tail of `split=full`, on the
 * assumption that the split is ordered oldest-first. It is not — it is
 * grouped by category, and its last 3,000 rows were all `spanish` (11
 * publish dates, zero `overall`). The scan found no candidates, returned
 * null without an error, and every one of 188 committed snapshots shipped
 * with every row "new" and `prevPublishDate: null`. The recorded tail page
 * is pinned in __tests__/fixtures/hf-full-split-tail.json.
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

export type CommittedBenchmarks = {
  /** `data/benchmarks/lmarena-latest.json` as committed before this run. */
  latest: { meta: { leaderboardPublishDate: string } | null; rows: ArenaRow[] } | null;
  /** `data/benchmarks/lmarena-previous.json` as committed before this run. */
  previous: ArenaRow[] | null;
};

export type PreviousChoice = {
  previous: ArenaRow[] | null;
  /** Rows to write to lmarena-previous.json — set only when the publish date rolled over. */
  rollover: ArenaRow[] | null;
  reason: string;
};

const ARENA_KEYS = [
  "rank", "modelName", "organization", "rating", "ratingLower", "ratingUpper",
  "voteCount", "category", "leaderboardPublishDate",
] as const;

/** Committed rows carry rankDelta/eloDelta; the previous file holds plain ArenaRows. */
export function toArenaRows(rows: ArenaRow[]): ArenaRow[] {
  return rows.map((r) => {
    const out = {} as Record<string, unknown>;
    for (const k of ARENA_KEYS) out[k] = r[k];
    return out as ArenaRow;
  });
}

/**
 * Which snapshot the fetched `latestDate` is compared against.
 *  - committed latest is OLDER  → the board was republished: it becomes the previous (rollover).
 *  - committed latest is SAME   → rerun of the same board: reuse the stored previous.
 *  - committed latest is NEWER  → upstream went backwards: no comparison, never an invented one.
 * "Previous" therefore means the previous publish date this repo INGESTED. The daily cron
 * outpaces lmarena's publishes, so it is the previous published date in practice, and
 * `meta.prevPublishDate` names the actual date either way.
 */
export function choosePrevious(latestDate: string, committed: CommittedBenchmarks): PreviousChoice {
  const committedDate = committed.latest?.meta?.leaderboardPublishDate ?? null;
  if (committedDate === null || !committed.latest || committed.latest.rows.length === 0) {
    return { previous: null, rollover: null, reason: "no committed snapshot" };
  }
  if (committedDate < latestDate) {
    const rows = toArenaRows(committed.latest.rows);
    return { previous: rows, rollover: rows, reason: `rollover: ${committedDate} -> ${latestDate}` };
  }
  if (committedDate > latestDate) {
    return { previous: null, rollover: null, reason: `upstream went backwards: committed ${committedDate}, fetched ${latestDate}` };
  }
  const prev = committed.previous;
  if (prev && prev.length > 0 && prev[0].leaderboardPublishDate < latestDate) {
    return { previous: prev, rollover: null, reason: `carried: ${prev[0].leaderboardPublishDate}` };
  }
  return { previous: null, rollover: null, reason: "no previous snapshot on file" };
}

export type IngestResult =
  | { ok: true; payload: BenchmarksPayload; rollover: ArenaRow[] | null; previousReason: string }
  | { ok: false; reason: string; error?: string };

export async function runIngest(opts: {
  now?: () => Date;
  committed?: CommittedBenchmarks;
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

  const choice = choosePrevious(latestDate, opts.committed ?? { latest: null, previous: null });
  console.log("[benchmarks] previous snapshot:", choice.reason);
  const previous = choice.previous;

  const payload = buildPayload(current, previous, { fetchedAt });
  return { ok: true, payload, rollover: choice.rollover, previousReason: choice.reason };
}
