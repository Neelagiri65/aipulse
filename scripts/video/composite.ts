/**
 * ffmpeg compositor: walkthrough recording + TTS audio + lower-thirds → final MP4.
 *
 * Inputs:
 *   out/walkthrough.webm     — Playwright screen recording
 *   data/video-narration.mp3 — TTS narration audio
 *   data/curated.json        — narrative data for lower-third overlays
 *
 * Output:
 *   out/gawk-daily-YYYY-MM-DD.mp4
 *
 * Usage:
 *   npx tsx scripts/video/composite.ts
 *   npx tsx scripts/video/composite.ts --no-audio
 *   npx tsx scripts/video/composite.ts --format vertical
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import type { CurationResult } from "../../src/lib/curation/types";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const NO_AUDIO = args.includes("--no-audio");
const FORMAT = args.includes("--format")
  ? args[args.indexOf("--format") + 1] ?? "landscape"
  : "landscape";
const VIDEO_FORMAT = args.includes("--video-format")
  ? args[args.indexOf("--video-format") + 1] ?? "youtube"
  : "youtube";

const WALKTHROUGH = resolve(ROOT, "out/walkthrough.webm");
const AUDIO = resolve(ROOT, `data/video-narration-${VIDEO_FORMAT}.mp3`);
const AUDIO_FALLBACK = resolve(ROOT, "data/video-narration.mp3");
const NARRATION_SEGMENTS = resolve(ROOT, `data/narration-segments-${VIDEO_FORMAT}.json`);
const CURATED = resolve(ROOT, "data/curated.json");
const DATE = new Date().toISOString().slice(0, 10);

type NarrationSegmentData = {
  id: string;
  segment: string;
  headline: string;
  scene: string;
  durationSec: number;
  audioFile: string;
  videoStartSec?: number;
  videoEndSec?: number;
};

const BRAND = {
  bg: "06080a",
  bgAlpha: "06080aCC",
  fg: "d8e2e6",
  fgMuted: "7a8a90",
  accent: "2dd4bf",
  fontFamily: "Courier New",
};

type Overlay = {
  text: string;
  source: string;
  startSec: number;
  endSec: number;
};

function buildOverlaysFromNarrationSegments(segmentData: NarrationSegmentData[]): Overlay[] {
  const overlays: Overlay[] = [];

  for (const seg of segmentData) {
    if (seg.segment === "intro" || seg.segment === "outro") continue;
    if (seg.videoStartSec === undefined || seg.videoEndSec === undefined) continue;

    const sourceLabel = seg.scene
      .replace("sdk-adoption", "gawk.dev/sdk")
      .replace("models", "gawk.dev/models")
      .replace("tools", "gawk.dev/tools")
      .replace("wire", "gawk.dev/wire")
      .replace("labs", "gawk.dev/labs")
      .replace("globe", "gawk.dev");

    overlays.push({
      text: seg.headline.slice(0, 80),
      source: `Source: ${sourceLabel}`,
      startSec: seg.videoStartSec + 1,
      endSec: seg.videoEndSec - 1,
    });
  }

  return overlays;
}

function buildOverlaysFromCurated(curated: CurationResult): Overlay[] {
  const overlays: Overlay[] = [];
  const segments = curated.narratives;

  const timings: { segment: string; startSec: number; endSec: number }[] = [
    { segment: "hook", startSec: 0, endSec: 5 },
    { segment: "lead", startSec: 5, endSec: 15 },
    { segment: "story", startSec: 15, endSec: 35 },
    { segment: "community", startSec: 35, endSec: 55 },
    { segment: "radar", startSec: 55, endSec: 75 },
    { segment: "map", startSec: 75, endSec: 85 },
  ];

  for (const timing of timings) {
    const narrative = segments.find((n) => n.segment === timing.segment);
    if (!narrative) continue;

    const lead = narrative.events[0];
    if (!lead) continue;

    const sourceLabel = lead.source
      .replace("gawk-", "gawk.dev/")
      .replace("github-trending", "GitHub Trending")
      .replace("hn", "Hacker News")
      .replace("reddit", "Reddit")
      .replace("arxiv", "ArXiv")
      .replace("gdelt", "GDELT");

    overlays.push({
      text: narrative.headline.slice(0, 80),
      source: `Source: ${sourceLabel}`,
      startSec: timing.startSec + 1,
      endSec: timing.endSec - 1,
    });
  }

  return overlays;
}

function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "'")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "%%");
}

function buildFilterChain(overlays: Overlay[], format: string, videoDuration?: number): string {
  const filters: string[] = [];

  if (format === "vertical") {
    filters.push("crop=ih*9/16:ih:iw/2-ih*9/32:0");
    filters.push("scale=1080:1920");
  }

  // Persistent badge: "LIVE • gawk.dev" top-right
  filters.push(
    `drawtext=text='LIVE \\: gawk.dev':` +
      `font='${BRAND.fontFamily}':fontsize=20:fontcolor=0x${BRAND.accent}:` +
      `x=w-tw-30:y=25:` +
      `box=1:boxcolor=0x${BRAND.bgAlpha}:boxborderw=8`
  );

  // Date stamp top-left
  filters.push(
    `drawtext=text='${DATE}':` +
      `font='${BRAND.fontFamily}':fontsize=18:fontcolor=0x${BRAND.fgMuted}:` +
      `x=30:y=28:` +
      `box=1:boxcolor=0x${BRAND.bgAlpha}:boxborderw=6`
  );

  // Lower-third overlays: DOM-injected versions are captured in the recording
  // (better styling: gradients, backdrop-filter, rounded corners, animation).
  // Only add ffmpeg drawtext lower-thirds for formats that skip recording (vertical crop).
  if (format === "vertical") {
    for (const o of overlays) {
      const headline = escapeFFmpegText(o.text);
      const source = escapeFFmpegText(o.source);
      const yBase = "h-h*0.28";

      filters.push(
        `drawtext=text='${headline}':` +
          `font='${BRAND.fontFamily}':fontsize=28:fontcolor=0x${BRAND.fg}:` +
          `x=40:y=${yBase}:` +
          `box=1:boxcolor=0x${BRAND.bgAlpha}:boxborderw=12:` +
          `enable='between(t,${o.startSec},${o.endSec})'`
      );

      filters.push(
        `drawtext=text='${source}':` +
          `font='${BRAND.fontFamily}':fontsize=18:fontcolor=0x${BRAND.accent}:` +
          `x=40:y=${yBase}+42:` +
          `box=1:boxcolor=0x${BRAND.bgAlpha}:boxborderw=6:` +
          `enable='between(t,${o.startSec},${o.endSec})'`
      );
    }
  }

  // CTA at the end
  const ctaEnd = videoDuration ?? (format === "vertical" ? 60 : 90);
  const ctaStart = ctaEnd - 5;
  filters.push(
    `drawtext=text='gawk.dev':` +
      `font='${BRAND.fontFamily}':fontsize=48:fontcolor=0x${BRAND.accent}:` +
      `x=(w-tw)/2:y=(h-th)/2-20:` +
      `enable='between(t,${ctaStart},${ctaEnd})'`
  );
  filters.push(
    `drawtext=text='See what the AI world actually sees.':` +
      `font='${BRAND.fontFamily}':fontsize=22:fontcolor=0x${BRAND.fgMuted}:` +
      `x=(w-tw)/2:y=(h-th)/2+30:` +
      `enable='between(t,${ctaStart},${ctaEnd})'`
  );

  return filters.join(",");
}

function main() {
  if (!existsSync(WALKTHROUGH)) {
    console.error(`Missing: ${WALKTHROUGH}`);
    console.error("Run: npx tsx scripts/video/record-walkthrough.ts");
    process.exit(1);
  }

  let overlays: Overlay[] = [];

  if (existsSync(NARRATION_SEGMENTS)) {
    const segmentData: NarrationSegmentData[] = JSON.parse(readFileSync(NARRATION_SEGMENTS, "utf-8"));
    overlays = buildOverlaysFromNarrationSegments(segmentData);
    console.log(`Loaded ${overlays.length} lower-third overlays from narration segments (manifest-timed)`);
  } else if (existsSync(CURATED)) {
    const curated: CurationResult = JSON.parse(readFileSync(CURATED, "utf-8"));
    overlays = buildOverlaysFromCurated(curated);
    console.log(`Loaded ${overlays.length} lower-third overlays from curated.json (hardcoded timing)`);
  } else {
    console.warn("No narration segments or curated.json found — compositing without lower-thirds");
  }

  const audioPath = existsSync(AUDIO) ? AUDIO : existsSync(AUDIO_FALLBACK) ? AUDIO_FALLBACK : null;
  const hasAudio = !NO_AUDIO && audioPath !== null;

  // Detect actual video duration for youtube format
  let duration = FORMAT === "vertical" ? 60 : 90;
  if (VIDEO_FORMAT === "youtube") {
    try {
      const probe = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${WALKTHROUGH}" 2>&1`
      ).toString().trim();
      const videoDur = Math.floor(parseFloat(probe) || 0);
      if (videoDur > 0) duration = videoDur;
    } catch { /* fall back to default */ }
  }
  const outFile = resolve(
    ROOT,
    `out/gawk-daily-${DATE}${FORMAT === "vertical" ? "-vertical" : ""}.mp4`
  );

  const filterChain = buildFilterChain(overlays, FORMAT, duration);

  const cmd = [
    "ffmpeg -y",
    `-i "${WALKTHROUGH}"`,
    hasAudio ? `-i "${audioPath}"` : "",
    `-t ${duration}`,
    `-vf "${filterChain}"`,
    hasAudio ? "-map 0:v -map 1:a" : "-an",
    "-c:v libx264 -preset medium -crf 23",
    hasAudio ? "-c:a aac -b:a 128k" : "",
    "-movflags +faststart",
    `-s ${FORMAT === "vertical" ? "1080x1920" : "1920x1080"}`,
    `"${outFile}"`,
  ]
    .filter(Boolean)
    .join(" ");

  console.log(`\nCompositing (${FORMAT}, ${duration}s)...`);
  console.log(`  Video: ${WALKTHROUGH}`);
  if (hasAudio) console.log(`  Audio: ${audioPath}`);
  console.log(`  Overlays: ${overlays.length} lower-thirds`);
  console.log(`  Output: ${outFile}\n`);

  try {
    execSync(cmd, { stdio: "inherit", timeout: 120_000 });
    console.log(`\nDone: ${outFile}`);
  } catch (e) {
    console.error("ffmpeg failed:", e);
    process.exit(1);
  }
}

main();
