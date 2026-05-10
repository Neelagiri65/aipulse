/**
 * End-to-end daily video pipeline.
 * One command to fetch, curate, narrate, record, composite, and distribute.
 *
 * Usage:
 *   npx tsx scripts/video/daily.ts                  # full pipeline + distribute
 *   npx tsx scripts/video/daily.ts --no-distribute   # render only, skip uploads
 *   npx tsx scripts/video/daily.ts --formats youtube # single format
 *   npx tsx scripts/video/daily.ts --skip-fetch       # reuse existing data
 */

import { execSync } from "child_process";
import { existsSync, renameSync, copyFileSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();
const args = process.argv.slice(2);

const NO_DISTRIBUTE = args.includes("--no-distribute");
const SKIP_FETCH = args.includes("--skip-fetch");
const FORMATS = getArg("--formats", "youtube,instagram").split(",").map((f) => f.trim());
const DATE = new Date().toISOString().slice(0, 10);

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

type StepResult = { step: string; status: "ok" | "fail" | "skip"; durationMs: number; error?: string };
const results: StepResult[] = [];

function run(step: string, cmd: string, opts?: { optional?: boolean; timeout?: number }): boolean {
  const start = Date.now();
  console.log(`\n[${"=".repeat(60)}]`);
  console.log(`  STEP: ${step}`);
  console.log(`[${"=".repeat(60)}]\n`);

  try {
    execSync(cmd, {
      cwd: ROOT,
      stdio: "inherit",
      timeout: opts?.timeout ?? 120_000,
    });
    const ms = Date.now() - start;
    console.log(`\n  ✓ ${step} (${(ms / 1000).toFixed(1)}s)`);
    results.push({ step, status: "ok", durationMs: ms });
    return true;
  } catch (e: any) {
    const ms = Date.now() - start;
    const errMsg = e.message?.slice(0, 200) || "Unknown error";
    if (opts?.optional) {
      console.log(`\n  ⊘ ${step} skipped (${errMsg})`);
      results.push({ step, status: "skip", durationMs: ms, error: errMsg });
      return true;
    }
    console.error(`\n  ✗ ${step} FAILED (${(ms / 1000).toFixed(1)}s)`);
    console.error(`    ${errMsg}`);
    results.push({ step, status: "fail", durationMs: ms, error: errMsg });
    return false;
  }
}

function fileExists(path: string): boolean {
  return existsSync(resolve(ROOT, path));
}

function main() {
  const pipelineStart = Date.now();

  console.log(`\n${"━".repeat(60)}`);
  console.log(`  GAWK DAILY — ${DATE}`);
  console.log(`  Formats: ${FORMATS.join(", ")}`);
  console.log(`${"━".repeat(60)}`);

  // ─── PHASE 1: DATA ───

  if (!SKIP_FETCH) {
    if (!run("Fetch video data", "npx tsx scripts/video/fetch-video-data.ts")) {
      abort("Cannot proceed without fresh data");
    }
  } else {
    console.log("\n  Skipping fetch (--skip-fetch)");
    results.push({ step: "Fetch video data", status: "skip", durationMs: 0 });
  }

  // Curate stories (generates data/curated.json)
  if (!run("Curate stories", "npx tsx scripts/video/curate-stories.ts --max 4")) {
    abort("Cannot proceed without curated stories");
  }

  // ─── PHASE 2: GENERATE FRESH SCRIPT + NARRATION ───

  // Always regenerate from today's curated data — stale locked files produce repeated content
  if (!run("Generate daily script", "npx tsx scripts/video/generate-daily-script.ts")) {
    abort("Cannot proceed without a script");
  }

  // ─── PHASE 3: RECORD + COMPOSITE PER FORMAT ───

  for (const format of FORMATS) {
    const isVertical = format === "instagram";
    const recorderFormat = format; // youtube | instagram
    const compositorFormat = isVertical ? "vertical" : "landscape";
    const suffix = isVertical ? "-vertical" : "";
    const outFile = `out/gawk-daily-${DATE}${suffix}.mp4`;

    console.log(`\n${"─".repeat(60)}`);
    console.log(`  FORMAT: ${format} (${isVertical ? "1080×1920" : "1920×1080"})`);
    console.log(`${"─".repeat(60)}`);

    // Record walkthrough
    if (!run(
      `Record walkthrough (${format})`,
      `npx tsx scripts/video/record-walkthrough.ts --format ${recorderFormat}`,
      { timeout: 180_000 }
    )) {
      console.error(`  Skipping ${format} — recording failed`);
      continue;
    }

    // Preserve walkthrough per format (recorder always writes to out/walkthrough.webm)
    const walkthroughSrc = resolve(ROOT, "out/walkthrough.webm");
    const walkthroughDest = resolve(ROOT, `out/walkthrough-${format}.webm`);
    if (existsSync(walkthroughSrc)) {
      copyFileSync(walkthroughSrc, walkthroughDest);
    }

    // Generate narration from locked script (always present after generate-daily-script)
    run(
      `Generate narration (${format})`,
      "npx tsx scripts/video/generate-narration-locked.ts",
      { optional: true }
    );

    // Composite
    if (!run(
      `Composite (${format})`,
      `npx tsx scripts/video/composite.ts --format ${compositorFormat} --video-format ${recorderFormat}`,
      { timeout: 120_000 }
    )) {
      console.error(`  Skipping ${format} — compositing failed`);
      continue;
    }

    if (fileExists(outFile)) {
      console.log(`\n  Output: ${outFile}`);
    }
  }

  // ─── PHASE 4: DISTRIBUTE ───

  if (!NO_DISTRIBUTE) {
    const platforms = FORMATS.map((f) => {
      if (f === "youtube") return "youtube";
      if (f === "instagram") return "instagram";
      return f;
    });

    // Also add facebook if we have both formats
    if (FORMATS.includes("youtube")) {
      platforms.push("facebook");
    }

    run(
      "Distribute",
      `npx tsx scripts/video/distribute.ts --platforms ${platforms.join(",")}`,
      { timeout: 300_000, optional: true }
    );
  } else {
    console.log("\n  Skipping distribution (--no-distribute)");
    results.push({ step: "Distribute", status: "skip", durationMs: 0 });
  }

  // ─── SUMMARY ───

  const totalMs = Date.now() - pipelineStart;
  const ok = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");

  console.log(`\n${"━".repeat(60)}`);
  console.log(`  PIPELINE COMPLETE — ${(totalMs / 1000).toFixed(0)}s total`);
  console.log(`${"━".repeat(60)}`);
  console.log(`  ${ok.length} passed, ${failed.length} failed, ${skipped.length} skipped\n`);

  for (const r of results) {
    const icon = r.status === "ok" ? "✓" : r.status === "fail" ? "✗" : "⊘";
    const time = r.durationMs > 0 ? ` (${(r.durationMs / 1000).toFixed(1)}s)` : "";
    console.log(`  ${icon} ${r.step}${time}`);
  }

  // List output files
  console.log(`\n  Output files:`);
  for (const format of FORMATS) {
    const suffix = format === "instagram" ? "-vertical" : "";
    const file = `out/gawk-daily-${DATE}${suffix}.mp4`;
    if (fileExists(file)) {
      console.log(`    ${file}`);
    }
  }

  console.log();

  if (failed.length > 0) {
    process.exit(1);
  }
}

function abort(reason: string): never {
  console.error(`\n  ABORT: ${reason}`);
  const totalMs = results.reduce((a, r) => a + r.durationMs, 0);
  console.log(`\n  Pipeline aborted after ${(totalMs / 1000).toFixed(0)}s`);
  process.exit(1);
}

main();
