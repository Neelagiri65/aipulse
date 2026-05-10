/**
 * Distribute today's Gawk Daily video to all configured platforms.
 *
 * Runs each platform upload in sequence, continues on failure.
 * Logs results to data/upload-log.json.
 *
 * Usage:
 *   npx tsx scripts/video/distribute.ts
 *   npx tsx scripts/video/distribute.ts --platforms youtube,instagram,facebook,tiktok
 *   npx tsx scripts/video/distribute.ts --dry-run
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const ALL_PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"] as const;
type Platform = typeof ALL_PLATFORMS[number];

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const requestedPlatforms = getArg("--platforms", ALL_PLATFORMS.join(","))
  .split(",")
  .map((p) => p.trim()) as Platform[];

const DATE = new Date().toISOString().slice(0, 10);

type PlatformConfig = {
  platform: Platform;
  script: string;
  videoFile: string;
  extraArgs: string[];
  configCheck: () => boolean;
};

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    platform: "youtube",
    script: "scripts/video/upload-youtube.ts",
    videoFile: `out/gawk-daily-${DATE}.mp4`,
    extraArgs: ["--visibility", "public"],
    configCheck: () => existsSync(resolve(process.env.HOME || "~", ".secrets/youtube-client-secret.json")),
  },
  {
    platform: "instagram",
    script: "scripts/video/upload-instagram.ts",
    videoFile: `out/gawk-daily-${DATE}-vertical.mp4`,
    extraArgs: [],
    configCheck: () =>
      existsSync(resolve(process.env.HOME || "~", ".secrets/meta-config.json")) &&
      existsSync(resolve(process.env.HOME || "~", ".secrets/meta-token.json")),
  },
  {
    platform: "facebook",
    script: "scripts/video/upload-facebook.ts",
    videoFile: `out/gawk-daily-${DATE}.mp4`,
    extraArgs: [],
    configCheck: () =>
      existsSync(resolve(process.env.HOME || "~", ".secrets/meta-config.json")) &&
      existsSync(resolve(process.env.HOME || "~", ".secrets/meta-token.json")),
  },
  {
    platform: "tiktok",
    script: "scripts/video/upload-tiktok.ts",
    videoFile: `out/gawk-daily-${DATE}-vertical.mp4`,
    extraArgs: [],
    configCheck: () =>
      existsSync(resolve(process.env.HOME || "~", ".secrets/tiktok-config.json")),
  },
];

type DistResult = {
  platform: Platform;
  status: "success" | "skipped" | "failed";
  url?: string;
  error?: string;
  durationMs?: number;
};

function main() {
  console.log(`\n  Gawk Daily Distribution — ${DATE}`);
  console.log(`  ${"─".repeat(40)}\n`);

  const results: DistResult[] = [];

  for (const config of PLATFORM_CONFIGS) {
    if (!requestedPlatforms.includes(config.platform)) {
      continue;
    }

    const videoPath = resolve(ROOT, config.videoFile);

    // Pre-flight checks
    if (!existsSync(videoPath)) {
      console.log(`  [${config.platform.toUpperCase().padEnd(10)}] SKIP — video not found: ${config.videoFile}`);
      results.push({ platform: config.platform, status: "skipped", error: `Missing ${config.videoFile}` });
      continue;
    }

    if (!config.configCheck()) {
      console.log(`  [${config.platform.toUpperCase().padEnd(10)}] SKIP — credentials not configured`);
      results.push({ platform: config.platform, status: "skipped", error: "Missing credentials" });
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [${config.platform.toUpperCase().padEnd(10)}] DRY RUN — would upload ${config.videoFile}`);
      results.push({ platform: config.platform, status: "skipped", error: "Dry run" });
      continue;
    }

    // Execute upload
    const start = Date.now();
    console.log(`  [${config.platform.toUpperCase().padEnd(10)}] Uploading...`);

    try {
      const cmd = [
        "npx tsx",
        config.script,
        ...config.extraArgs,
      ].join(" ");

      const output = execSync(cmd, {
        cwd: ROOT,
        timeout: 300_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      const durationMs = Date.now() - start;

      // Extract URL from output
      const urlMatch = output.match(/(?:Uploaded|Published): (https?:\/\/\S+)/);
      const url = urlMatch?.[1];

      console.log(`  [${config.platform.toUpperCase().padEnd(10)}] DONE — ${url || "uploaded"} (${(durationMs / 1000).toFixed(1)}s)`);
      results.push({ platform: config.platform, status: "success", url, durationMs });
    } catch (e: any) {
      const durationMs = Date.now() - start;
      const errMsg = e.stderr?.toString().slice(-200) || e.message || "Unknown error";
      console.log(`  [${config.platform.toUpperCase().padEnd(10)}] FAIL — ${errMsg.split("\n").pop()}`);
      results.push({ platform: config.platform, status: "failed", error: errMsg, durationMs });
    }
  }

  // Summary
  console.log(`\n  ${"─".repeat(40)}`);
  console.log(`  Summary:`);

  const succeeded = results.filter((r) => r.status === "success");
  const failed = results.filter((r) => r.status === "failed");
  const skipped = results.filter((r) => r.status === "skipped");

  if (succeeded.length) {
    console.log(`    Uploaded: ${succeeded.map((r) => r.platform).join(", ")}`);
    for (const r of succeeded) {
      if (r.url) console.log(`      ${r.platform}: ${r.url}`);
    }
  }
  if (skipped.length) {
    console.log(`    Skipped:  ${skipped.map((r) => `${r.platform} (${r.error})`).join(", ")}`);
  }
  if (failed.length) {
    console.log(`    Failed:   ${failed.map((r) => r.platform).join(", ")}`);
  }

  console.log();

  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
