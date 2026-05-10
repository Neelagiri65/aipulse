/**
 * Generate TTS narration from locked script — no LLM, no curation.
 * Reads data/narration-locked.json and data/script-locked.json,
 * produces per-segment MP3s and the final concatenated audio.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const VOICE = "en-US-ChristopherNeural";
const BASE_RATE = 12;
const EDGE_TTS = "/tmp/edge-tts-venv/bin/edge-tts";

type LockedNarration = { id: string; narration: string };
type LockedStory = { id: string; segment: string; headline: string; scene: string; holdSec: number };

function generateTTS(text: string, outFile: string, ratePercent = 0): number {
  const escaped = text.replace(/"/g, '\\"').replace(/`/g, "");
  const effectiveRate = ratePercent + BASE_RATE;
  const rateFlag = effectiveRate !== 0 ? ` --rate="+${effectiveRate}%"` : "";
  try {
    execSync(
      `${EDGE_TTS} --voice "${VOICE}" --text "${escaped}"${rateFlag} --write-media "${outFile}" 2>&1`,
      { timeout: 60_000 }
    );
  } catch (e) {
    console.error(`TTS failed for ${outFile}:`, e);
    return 0;
  }

  const probe = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outFile}" 2>&1`
  ).toString().trim();
  return parseFloat(probe) || 0;
}

function main() {
  const narrationPath = resolve(ROOT, "data/narration-locked.json");
  const scriptPath = resolve(ROOT, "data/script-locked.json");
  const manifestPath = resolve(ROOT, "data/video-manifest-youtube.json");

  if (!existsSync(narrationPath)) {
    console.error("Missing data/narration-locked.json");
    process.exit(1);
  }

  const narrations: LockedNarration[] = JSON.parse(readFileSync(narrationPath, "utf-8"));
  const stories: LockedStory[] = existsSync(scriptPath)
    ? JSON.parse(readFileSync(scriptPath, "utf-8"))
    : [];

  // Read manifest if available (from recorder output)
  let manifest: { id: string; startSec: number; endSec: number }[] = [];
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    console.log(`Using manifest: ${manifest.length} segments\n`);
  }

  const segments: {
    id: string; segment: string; headline: string; narration: string;
    scene: string; durationSec: number; audioFile: string;
    videoStartSec?: number; videoEndSec?: number;
  }[] = [];

  for (const n of narrations) {
    const story = stories.find(s => s.id === n.id);
    const mEntry = manifest.find(m => m.id === n.id);
    const outFile = resolve(ROOT, `out/narration-seg-${n.id}.mp3`);

    console.log(`[${(story?.segment ?? n.id).toUpperCase().padEnd(9)}] ${n.narration.slice(0, 60)}`);

    let dur = generateTTS(n.narration, outFile);

    // Speed up if narration is longer than available video time
    if (mEntry) {
      const avail = mEntry.endSec - mEntry.startSec;
      if (dur > avail) {
        const speedUp = Math.min(40, Math.round(((dur / avail) - 1) * 100) + 10);
        console.log(`  ⚠ ${dur.toFixed(1)}s > ${avail.toFixed(1)}s — retrying at +${speedUp}%`);
        dur = generateTTS(n.narration, outFile, speedUp);
      }
    }

    console.log(`  ${dur.toFixed(1)}s`);

    segments.push({
      id: n.id,
      segment: story?.segment ?? n.id,
      headline: story?.headline ?? n.id,
      narration: n.narration,
      scene: story?.scene ?? "globe",
      durationSec: dur,
      audioFile: `out/narration-seg-${n.id}.mp3`,
      ...(mEntry ? { videoStartSec: mEntry.startSec, videoEndSec: mEntry.endSec } : {}),
    });
  }

  // Concatenate with silence gaps matching manifest timing
  const listFile = resolve(ROOT, "out/concat-list.txt");
  const lines: string[] = [];
  let cursor = 0;

  for (const seg of segments) {
    const targetStart = seg.videoStartSec ?? cursor;
    const gap = targetStart - cursor;

    if (gap > 0.05) {
      const gapFile = resolve(ROOT, `out/silence-${seg.id}.mp3`);
      execSync(
        `ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${gap.toFixed(3)} -c:a libmp3lame -b:a 192k "${gapFile}" 2>&1`
      );
      lines.push(`file '${gapFile}'`);
      cursor += gap;
    }

    lines.push(`file '${resolve(ROOT, seg.audioFile)}'`);
    cursor += seg.durationSec;
  }

  writeFileSync(listFile, lines.join("\n"));

  const fullAudio = resolve(ROOT, "data/video-narration-youtube.mp3");
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:a libmp3lame -b:a 192k "${fullAudio}" 2>&1`,
    { timeout: 60_000 }
  );

  // Also copy to default path
  execSync(`cp "${fullAudio}" "${resolve(ROOT, "data/video-narration.mp3")}"`);

  const probe = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${fullAudio}" 2>&1`
  ).toString().trim();
  console.log(`\nFull narration: ${fullAudio} (${parseFloat(probe).toFixed(1)}s)`);

  // Write segments JSON
  const outPath = resolve(ROOT, "data/narration-segments-youtube.json");
  writeFileSync(outPath, JSON.stringify(segments, null, 2));
  console.log(`Segments: ${outPath}`);

  const totalDur = segments.reduce((s, seg) => s + seg.durationSec, 0);
  console.log(`\nTotal narration: ${totalDur.toFixed(1)}s across ${segments.length} segments`);
}

main();
