#!/usr/bin/env node
/**
 * Lint ratchet: the eslint error count may go down, never up.
 *
 * CI never ran eslint, and main carries ~150 errors — 41 in src (React
 * compiler rules), 63 in scripts/video, 44 in wmsample. A hard gate would
 * mean a sweep across the dashboard, the map and the video pipeline for no
 * product change. A ratchet stops NEW errors landing today and lets the
 * baseline be lowered as real cleanups ship.
 *
 *   node scripts/lint-ratchet.mjs          # compare against .lint-baseline.json
 *   node scripts/lint-ratchet.mjs --write  # record the current count as the new baseline
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const BASELINE = ".lint-baseline.json";
const write = process.argv.includes("--write");

let report;
try {
  report = execFileSync("npx", ["eslint", ".", "-f", "json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
  // eslint exits 1 when there are errors; the JSON is still on stdout.
  report = e.stdout;
  if (!report) {
    console.error("✗ eslint produced no report");
    process.exit(2);
  }
}
const files = JSON.parse(report);
const errors = files.reduce((n, f) => n + f.errorCount, 0);
const byDir = {};
for (const f of files) {
  if (!f.errorCount) continue;
  const rel = f.filePath.replace(`${process.cwd()}/`, "");
  const key = rel.split("/").slice(0, rel.startsWith("src/") ? 2 : 2).join("/");
  byDir[key] = (byDir[key] ?? 0) + f.errorCount;
}

if (write) {
  const prev = JSON.parse(readFileSync(BASELINE, "utf8"));
  writeFileSync(BASELINE, JSON.stringify({ ...prev, errors }, null, 2) + "\n");
  console.log(`baseline written: ${errors} errors`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8")).errors;
console.log(`eslint errors: ${errors} (baseline ${baseline})`);
for (const [k, v] of Object.entries(byDir).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

if (errors > baseline) {
  console.error(`\n✗ ${errors - baseline} new eslint error(s) above the baseline. Fix them; do not raise the baseline.`);
  const offenders = files.filter((f) => f.errorCount).map((f) => `${f.filePath.replace(`${process.cwd()}/`, "")} (${f.errorCount})`);
  console.error(`  files with errors:\n    ${offenders.slice(0, 40).join("\n    ")}`);
  process.exit(1);
}
if (errors < baseline) {
  console.log(`\n✓ ${baseline - errors} fewer than the baseline — lower it: node scripts/lint-ratchet.mjs --write`);
}
console.log("✓ lint ratchet holds");
