/**
 * CLI wrapper around runIngest. Invoked by
 * .github/workflows/benchmarks-ingest.yml on a daily cron.
 *
 * Writes data/benchmarks/lmarena-latest.json IFF the JSON differs
 * from what's currently committed — the workflow step does the
 * actual `git commit` only when `git diff --exit-code` reports a
 * change. Stable key order + no timestamps inside rows[] keep
 * no-op ingests diff-clean (idempotency per PRD AC 10).
 *
 * Run locally (after BENCH-03 + BENCH-04 land) with:
 *   npx --yes tsx scripts/ingest-benchmarks.mts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { runIngest, type CommittedBenchmarks } from "../src/lib/data/benchmarks-ingest.ts";

const OUT_PATH = path.join(
  process.cwd(),
  "data",
  "benchmarks",
  "lmarena-latest.json",
);
// The snapshot deltas compare against — see choosePrevious in benchmarks-ingest.ts.
const PREV_PATH = path.join(process.cwd(), "data", "benchmarks", "lmarena-previous.json");

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(p, "utf8")) as T;
  } catch {
    return null; // absent on first ingest
  }
}

async function main() {
  console.log("[benchmarks] runIngest()");
  const committed: CommittedBenchmarks = {
    latest: await readJson<CommittedBenchmarks["latest"]>(OUT_PATH),
    previous: await readJson<CommittedBenchmarks["previous"]>(PREV_PATH),
  };
  const result = await runIngest({ committed });
  if (!result.ok) {
    console.error(
      "[benchmarks] INGEST FAILED:",
      result.reason,
      result.error ?? "",
    );
    // Exit 0 — a failed fetch keeps the committed JSON unchanged
    // (per PRD AC 13: "cron fetch failure keeps the last committed
    // JSON unchanged; UI continues to serve it; log entry captures
    // failure"). The workflow step runs `git diff --exit-code` which
    // will see no change and skip the commit.
    process.exit(0);
  }

  if (result.behindCommitted) {
    // Upstream served an older board than the one committed. Keep the committed (newer) board;
    // writing this one would make the next rollover store it as "previous" and lose the newer.
    console.warn("[benchmarks] NOT WRITTEN —", result.previousReason);
    process.exit(0);
  }

  const payload = result.payload;
  if (!payload.ok) {
    console.error("[benchmarks] payload not ok:", payload.reason);
    process.exit(0);
  }

  const warnings = payload.sanity.warnings;
  if (warnings.length > 0) {
    console.warn(
      "[benchmarks] sanity warnings (non-blocking):",
      JSON.stringify(warnings),
    );
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  if (result.rollover) {
    // Written before latest is overwritten: this is the board being replaced.
    await writeFile(PREV_PATH, JSON.stringify(result.rollover, null, 2) + "\n", "utf8");
    console.log("[benchmarks] rolled previous snapshot to", result.rollover[0]?.leaderboardPublishDate);
  }
  const next = JSON.stringify(payload, null, 2) + "\n";

  let prev = "";
  try {
    prev = await readFile(OUT_PATH, "utf8");
  } catch {
    // file absent — first ingest.
  }

  if (prev === next) {
    console.log("[benchmarks] no change (idempotent); publishDate=",
      payload.meta.leaderboardPublishDate);
    process.exit(0);
  }

  await writeFile(OUT_PATH, next, "utf8");
  console.log(
    "[benchmarks] wrote",
    OUT_PATH,
    "publishDate=",
    payload.meta.leaderboardPublishDate,
    "prev=",
    payload.meta.prevPublishDate ?? "(none)",
    "rows=",
    payload.rows.length,
  );
}

main().catch((err) => {
  console.error("[benchmarks] unexpected error:", err);
  // Exit 0 so the workflow's git-diff step runs and produces a clean no-op.
  process.exit(0);
});
