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
import { existsSync, readFileSync, renameSync, copyFileSync } from "fs";
import { resolve } from "path";

import { planDistribution } from "../../src/lib/video/plan-distribution";

const ROOT = process.cwd();
const args = process.argv.slice(2);

const FORCE_DISTRIBUTE = args.includes("--force-distribute");
const NO_DISTRIBUTE = args.includes("--no-distribute");
const ALLOW_LOCAL_DISTRIBUTE = args.includes("--allow-local-distribute");
const SKIP_FETCH = args.includes("--skip-fetch");
const FAIL_FORWARD = args.includes("--fail-forward");
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
  if (!run("Curate stories", "npx tsx scripts/video/curate-stories.ts --max 10")) {
    abort("Cannot proceed without curated stories");
  }

  // ─── PHASE 2: GENERATE FRESH SCRIPT + NARRATION ───

  // Always regenerate from today's curated data — stale locked files produce repeated content
  if (!run("Generate daily script", "npx tsx scripts/video/generate-daily-script.ts")) {
    abort("Cannot proceed without a script");
  }

  // Content validation — NEVER degraded, even in fail-forward mode
  if (!run("Validate content", "npx tsx scripts/video/validate-content.ts")) {
    abort("Content validation failed — contradictions in script");
  }

  // Narration pre-flight — runs the REAL narration generator in stub mode (no
  // network, no ffmpeg) to prove every segment audio path resolves flat under
  // out/ and ids match the script. Catches the "/"-in-id class (scoped npm
  // packages, HF org/model ids) in ~1s, BEFORE the expensive recording step,
  // instead of detonating in production at 07:00 UTC. NEVER degraded.
  if (!run(
    "Narration pre-flight (stub)",
    "STUB_TTS=1 npx tsx scripts/video/generate-narration-locked.ts",
  )) {
    abort("Narration pre-flight failed — a segment path/id is unsafe; fix before recording");
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
      if (!FAIL_FORWARD) {
        console.error(`  Skipping ${format} — recording failed`);
        continue;
      }
      // Fallback: capture screenshots → stitch into a slideshow webm composite can ingest
      console.warn(`  DEGRADED: Recording failed — attempting screenshot → slideshow fallback`);
      const screenshotOk = run(
        `Screenshot fallback (${format})`,
        `npx tsx scripts/video/capture-screenshots.ts --format ${recorderFormat}`,
        { optional: true, timeout: 60_000 }
      );
      if (screenshotOk && existsSync(resolve(ROOT, "public/video-screenshots/map-global.png"))) {
        run(
          `Stitch screenshots → webm (${format})`,
          `ffmpeg -y -framerate 1/5 -pattern_type glob -i "public/video-screenshots/*.png" -c:v libvpx -pix_fmt yuva420p -auto-alt-ref 0 out/walkthrough.webm`,
          { optional: true, timeout: 30_000 }
        );
      }
    }

    // Preserve walkthrough per format (recorder always writes to out/walkthrough.webm)
    const walkthroughSrc = resolve(ROOT, "out/walkthrough.webm");
    const walkthroughDest = resolve(ROOT, `out/walkthrough-${format}.webm`);
    if (existsSync(walkthroughSrc)) {
      copyFileSync(walkthroughSrc, walkthroughDest);
    }

    // Generate narration from locked script. Narration IS the product — never
    // optional, even in --fail-forward. A TTS failure is a HARD STOP: shipping
    // a silent daily video to a public channel is worse than shipping nothing.
    // (Visual degradation is allowed above; audio degradation is not.)
    if (!run(
      `Generate narration (${format})`,
      "npx tsx scripts/video/generate-narration-locked.ts",
    )) {
      abort(`Narration (TTS) failed for ${format} — refusing to ship a silent video`);
    }

    // Composite the walkthrough WITH narration audio. No silent fallback: if
    // compositing fails we hard-stop rather than ship a raw, audio-less
    // walkthrough. The downstream distribute step independently re-verifies the
    // audio track (defence-in-depth) before any upload.
    if (!run(
      `Composite (${format})`,
      `npx tsx scripts/video/composite.ts --format ${compositorFormat} --video-format ${recorderFormat}`,
      { timeout: 120_000 }
    )) {
      abort(`Composite failed for ${format} — refusing to ship a degraded video`);
    }

    if (fileExists(outFile)) {
      console.log(`\n  Output: ${outFile}`);
    }
  }

  // ─── PHASE 4: DISTRIBUTE ───

  const uploadLogPath = resolve(ROOT, "data/upload-log.json");
  const todayEntry = (() => {
    if (!existsSync(uploadLogPath)) return null;
    try {
      const log = JSON.parse(readFileSync(uploadLogPath, "utf-8"));
      return (
        log.find((e: { date: string }) => e.date === DATE) ?? null
      );
    } catch { return null; }
  })();

  const requested = FORMATS.map((f) => {
    if (f === "youtube") return "youtube";
    if (f === "instagram") return "instagram";
    return f;
  });
  if (FORMATS.includes("youtube")) {
    // facebook dropped 2026-07-05 (founder decision): META creds were
    // never in CI secrets, so it silently skipped on every scheduled
    // run — an honest absence beats a silent skip. upload-facebook.ts
    // remains runnable explicitly if it's ever revived.
    requested.push("discord");
  }

  // Per-platform dedup + CI-only local guard — the 2026-07-05
  // half-distributed-day incident class. See plan-distribution.ts.
  const plan = planDistribution({
    requested,
    todayEntry,
    forceDistribute: FORCE_DISTRIBUTE,
    noDistribute: NO_DISTRIBUTE,
    isCi: process.env.GITHUB_ACTIONS === "true",
    allowLocalDistribute: ALLOW_LOCAL_DISTRIBUTE,
  });

  if (plan.kind === "run") {
    console.log(`\n  Distribution plan: ${plan.reason} → ${plan.platforms.join(", ")}`);
    run(
      "Distribute",
      `npx tsx scripts/video/distribute.ts --platforms ${plan.platforms.join(",")}`,
      { timeout: 300_000, optional: true }
    );
  } else if (plan.reason === "all-done") {
    console.log(`\n  Skipping distribution (all requested platforms already done for ${DATE} — use --force-distribute to override)`);
    results.push({ step: "Distribute", status: "skip", durationMs: 0 });
  } else if (plan.reason === "local-guard") {
    console.log("\n  Skipping distribution (not CI — pass --allow-local-distribute to upload from a local run)");
    results.push({ step: "Distribute", status: "skip", durationMs: 0 });
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

  if (failed.length > 0 && !FAIL_FORWARD) {
    process.exit(1);
  }

  // In fail-forward mode, exit 0 if ANY format produced output
  if (FAIL_FORWARD) {
    const anyOutput = FORMATS.some((format) => {
      const suffix = format === "instagram" ? "-vertical" : "";
      return fileExists(`out/gawk-daily-${DATE}${suffix}.mp4`);
    });
    if (!anyOutput) {
      console.error("\n  FAIL-FORWARD: No output produced for any format. Exiting with error.");
      process.exit(1);
    }
    if (failed.length > 0) {
      console.warn(`\n  FAIL-FORWARD: ${failed.length} steps failed but output was produced (degraded).`);
    }
  }
}

function abort(reason: string): never {
  console.error(`\n  ABORT: ${reason}`);
  const totalMs = results.reduce((a, r) => a + r.durationMs, 0);
  console.log(`\n  Pipeline aborted after ${(totalMs / 1000).toFixed(0)}s`);
  process.exit(1);
}

main();
