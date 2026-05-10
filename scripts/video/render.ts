/**
 * Renders the DailyBrief Remotion composition to MP4.
 *
 * Follows the daily-kanji ssr.ts pattern:
 *   bundle() → selectComposition() → renderMedia() → MP4
 *
 * Usage: npx tsx scripts/video/render.ts
 * Requires: data/video-daily.json (from fetch-video-data.ts)
 *           public/video-narration.mp3 (from generate-tts.ts)
 * Output:   out/daily-brief.mp4
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { readFileSync, mkdirSync, copyFileSync, existsSync } from "fs";
import { resolve } from "path";
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

  const data: VideoData = JSON.parse(readFileSync(dataPath, "utf-8"));
  const totalFrames = data.scenes.reduce((s, sc) => s + sc.durationInSeconds * 30, 0);

  console.log(`Bundling Remotion composition (${data.scenes.length} scenes, ${totalFrames} frames)...`);

  const bundled = await bundle({
    entryPoint: resolve(root, "src/video/index.tsx"),
    webpackOverride: (config) => {
      // Inject video data as a global constant (same pattern as Product Hunt Today)
      const webpack = require("webpack");
      return {
        ...config,
        plugins: [
          ...(config.plugins ?? []),
          new webpack.DefinePlugin({
            __VIDEO_DATA__: JSON.stringify(data),
            __HAS_AUDIO__: JSON.stringify(hasAudio),
            __HAS_SCREENSHOTS__: JSON.stringify(hasScreenshots),
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

  // Override duration to match actual scene count
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
