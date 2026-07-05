/**
 * One archive tick: capture the live gawk pipeline into the gawk-data
 * repo working tree (append-only public dataset).
 *
 * - Gated on /api/trust-audit: breaches on live output → SKIP (exit 0,
 *   logged) rather than persist suspect data.
 * - Events (/api/globe-events) append hourly, deduped by source event id.
 * - Numeric-feed snapshots (models/sdk/status/feed) are written once per
 *   UTC day — first tick of the day wins, never overwritten.
 * - Fail-loud: any endpoint failure exits 1 AFTER writing what succeeded
 *   (honest gaps beat silent ones; the workflow run goes red).
 *
 * Usage: npx tsx scripts/data/archive-tick.ts --target <gawk-data clone>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

import {
  archivePaths,
  makeEnvelope,
  mergeEventLines,
  shouldArchive,
} from "../../src/lib/data-archive/archive";

const GAWK_BASE = process.env.GAWK_BASE_URL || "https://gawk.dev";

const SNAPSHOT_ENDPOINTS: Record<string, string> = {
  models: "/api/v1/models",
  sdk: "/api/v1/sdk",
  status: "/api/v1/status",
  feed: "/api/feed",
};

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(`${GAWK_BASE}${path}`, { headers: { "user-agent": "gawk-data-archiver" } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const targetFlag = process.argv.indexOf("--target");
  const target = targetFlag !== -1 ? process.argv[targetFlag + 1] : undefined;
  if (!target || !existsSync(target)) {
    console.error("Usage: archive-tick.ts --target <existing gawk-data clone>");
    process.exit(2);
  }
  const root = resolve(target);
  const capturedAt = new Date().toISOString();
  const { eventsFile, snapshotsDir } = archivePaths(capturedAt);
  const failures: string[] = [];

  // Trust gate — never persist while the live output audit is breached
  try {
    const audit = (await fetchJson("/api/trust-audit")) as { ok?: boolean; findings?: unknown[] };
    if (!shouldArchive(audit)) {
      console.log(`[ARCHIVE] SKIP — trust-audit not clean (ok=${audit?.ok}, findings=${audit?.findings?.length ?? "?"})`);
      return;
    }
  } catch (e) {
    console.error(`[ARCHIVE] SKIP — trust-audit unreachable (${(e as Error).message}); refusing to archive unaudited output`);
    process.exit(1);
  }

  // Events — hourly append, deduped by source event id
  try {
    const globe = (await fetchJson("/api/globe-events")) as { points?: unknown[] };
    const file = join(root, eventsFile);
    mkdirSync(dirname(file), { recursive: true });
    const existing = existsSync(file) ? readFileSync(file, "utf-8") : "";
    const merged = mergeEventLines(existing, globe.points ?? [], "/api/globe-events", capturedAt);
    writeFileSync(file, merged.content);
    console.log(`[ARCHIVE] events: +${merged.added} (day total ${merged.total}, ${merged.skippedNoId} skipped no-id) → ${eventsFile}`);
  } catch (e) {
    failures.push(`globe-events: ${(e as Error).message}`);
  }

  // Snapshots — once per UTC day, never overwritten
  for (const [name, endpoint] of Object.entries(SNAPSHOT_ENDPOINTS)) {
    const file = join(root, snapshotsDir, `${name}.json`);
    if (existsSync(file)) {
      console.log(`[ARCHIVE] snapshot ${name}: already captured today, leaving as-is`);
      continue;
    }
    try {
      const body = await fetchJson(endpoint);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(makeEnvelope(body, endpoint, capturedAt), null, 1) + "\n");
      console.log(`[ARCHIVE] snapshot ${name}: captured → ${snapshotsDir}/${name}.json`);
    } catch (e) {
      failures.push(`${name}: ${(e as Error).message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`[ARCHIVE] ${failures.length} capture failure(s) — honest gap recorded, going loud:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("[ARCHIVE] tick complete");
}

main().catch((e) => {
  console.error(`[ARCHIVE] fatal: ${e?.message ?? e}`);
  process.exit(1);
});
