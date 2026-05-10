/**
 * Renders the DailyBrief Remotion composition to MP4.
 *
 * Hybrid architecture:
 *   - Map walkthrough: embedded as a Playwright-recorded webm via Remotion's <Video>
 *   - Data scenes: rendered natively by Remotion (title, signals, models, HN, CTA)
 *
 * Prerequisite files:
 *   data/video-daily.json       — from fetch-video-data.ts
 *   public/video-map-walkthrough.webm — from record-map.ts (optional, falls back to static map)
 *   public/video-screenshots/   — from capture-screenshots.ts (optional)
 *   data/video-narration.mp3    — from generate-tts.ts (optional)
 *
 * Output: out/daily-brief.mp4
 *
 * Usage: npx tsx scripts/video/render.ts
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { readFileSync, mkdirSync, copyFileSync, existsSync, renameSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";
import type { VideoData } from "../../src/video/types";

async function main() {
  const root = process.cwd();
  const dataPath = resolve(root, "data/video-daily.json");
  const audioSrc = resolve(root, "data/video-narration.mp3");
  const audioDest = resolve(root, "public/video-narration.mp3");

  if (!existsSync(dataPath)) {
    console.error("data/video-daily.json not found. Run fetch-video-data.ts first.");
    process.exit(1);
  }

  // Copy audio to public/ so Remotion's staticFile() can find it
  const hasAudio = existsSync(audioSrc);
  if (hasAudio) {
    copyFileSync(audioSrc, audioDest);
    console.log("Copied narration audio to public/");
  } else {
    console.warn("No narration audio found — video will be silent.");
  }

  // Check for screenshots
  const screenshotDir = resolve(root, "public/video-screenshots");
  const hasScreenshots = existsSync(resolve(screenshotDir, "map-global.png"));

  // Check for map walkthrough recording
  // Playwright outputs webm; we need to convert to mp4 for Remotion compatibility
  const mapWebm = resolve(root, "out/map-walkthrough.webm");
  const mapMp4Dest = resolve(root, "public/video-map-walkthrough.webm");
  let hasMapVideo = false;

  // Look for any webm in out/ that was produced by Playwright
  if (existsSync(mapWebm)) {
    copyFileSync(mapWebm, mapMp4Dest);
    hasMapVideo = true;
    console.log("Copied map walkthrough to public/");
  } else {
    // Playwright names files with UUIDs — find the most recent webm
    const outDir = resolve(root, "out");
    if (existsSync(outDir)) {
      const { readdirSync, statSync } = require("fs");
      const webms = readdirSync(outDir)
        .filter((f: string) => f.endsWith(".webm"))
        .map((f: string) => ({ name: f, mtime: statSync(join(outDir, f)).mtimeMs }))
        .sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);
      if (webms.length > 0) {
        copyFileSync(join(outDir, webms[0].name), mapMp4Dest);
        hasMapVideo = true;
        console.log(`Copied ${webms[0].name} as map walkthrough to public/`);
      }
    }
  }

  if (!hasMapVideo) {
    console.warn("No map walkthrough recording found — will use static fallback.");
  }

  const data: VideoData = JSON.parse(readFileSync(dataPath, "utf-8"));
  const totalFrames = data.scenes.reduce((s, sc) => s + sc.durationInSeconds * 30, 0);

  console.log(`Bundling Remotion composition (${data.scenes.length} scenes, ${totalFrames} frames, ${(totalFrames / 30).toFixed(0)}s)...`);

  const bundled = await bundle({
    entryPoint: resolve(root, "src/video/index.tsx"),
    webpackOverride: (config) => {
      const webpack = require("webpack");
      return {
        ...config,
        plugins: [
          ...(config.plugins ?? []),
          new webpack.DefinePlugin({
            __VIDEO_DATA__: JSON.stringify(data),
            __HAS_AUDIO__: JSON.stringify(hasAudio),
            __HAS_SCREENSHOTS__: JSON.stringify(hasScreenshots),
            __HAS_MAP_VIDEO__: JSON.stringify(hasMapVideo),
          }),
        ],
      };
    },
  });

  console.log("Selecting composition...");
  const composition = await selectComposition({
    serveUrl: bundled,
    id: "DailyBrief",
  });

  composition.durationInFrames = totalFrames;

  mkdirSync(resolve(root, "out"), { recursive: true });
  const outputPath = resolve(root, "out/daily-brief.mp4");

  console.log(`Rendering ${totalFrames} frames to ${outputPath}...`);
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outputPath,
    chromiumOptions: {
      gl: "swiftshader",
    },
  });

  console.log(`Done! Output: ${outputPath}`);
}

main().catch((e) => {
  console.error("Render failed:", e);
  process.exit(1);
});
