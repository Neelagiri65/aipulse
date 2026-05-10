/**
 * Generates broadcast narration from curated.json + Edge TTS audio per segment.
 *
 * Video-first mode (default): reads data/video-manifest-{format}.json (output by
 * record-walkthrough.ts) and fits narration text + TTS to each segment's measured
 * duration. Falls back to standalone mode if no manifest exists.
 *
 * Formats:
 *   --format youtube   (default) ~5 min, all 15-20 items with depth
 *   --format linkedin  90s, top 4-5 stories, landscape
 *   --format instagram 90s, top 3-4 stories, vertical-friendly
 *
 * Output:
 *   data/narration-segments.json — per-segment text, audio path, duration, scene
 *   data/video-narration.mp3    — concatenated full narration audio
 *
 * Usage:
 *   npx tsx scripts/video/generate-narration.ts
 *   npx tsx scripts/video/generate-narration.ts --format linkedin
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import type { CurationResult, Narrative, ScoredEvent } from "../../src/lib/curation/types";

type ManifestEntry = {
  id: string;
  segment: string;
  headline: string;
  scene: SceneDirection;
  holdSec: number;
  startSec: number;
  endSec: number;
};

const ROOT = process.cwd();
const CURATED = resolve(ROOT, "data/curated.json");
const VOICE = "en-US-ChristopherNeural";
const EDGE_TTS = "/tmp/edge-tts-venv/bin/edge-tts";
const DATE_SPOKEN = new Date().toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const args = process.argv.slice(2);
const FORMAT = args.includes("--format")
  ? (args[args.indexOf("--format") + 1] ?? "youtube")
  : "youtube";

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const TRANSITIONS = [
  "",
  "",
  "",
  "Also today...",
  "",
  "",
  "Meanwhile...",
  "",
  "",
  "",
];

function getTransition(index: number): string {
  return TRANSITIONS[index % TRANSITIONS.length];
}

type SceneDirection = "globe" | "tools" | "models" | "wire" | "sdk-adoption" | "labs";

type NarrationSegment = {
  id: string;
  segment: string;
  headline: string;
  narration: string;
  scene: SceneDirection;
  audioFile: string;
  durationSec: number;
};

function sourceToPanel(source: string): SceneDirection {
  if (source.startsWith("gawk-models")) return "models";
  if (source.startsWith("gawk-tools")) return "tools";
  if (source.startsWith("gawk-sdk")) return "sdk-adoption";
  if (source.startsWith("gawk-labs")) return "labs";
  return "wire";
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} million`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)} thousand`;
  return n.toString();
}

function sourceFriendlyName(source: string): string {
  const map: Record<string, string> = {
    "gawk-models": "the OpenRouter leaderboard",
    "gawk-tools": "tool status tracking",
    "gawk-sdk": "package download data",
    "gawk-labs": "the labs directory",
    "gawk-wire": "public sources",
    hn: "Hacker News",
    reddit: "Reddit",
    arxiv: "ArXiv",
    gdelt: "GDELT",
    "github-trending": "GitHub Trending",
    producthunt: "Product Hunt",
  };
  return map[source] ?? source;
}

// --- Narration builders: each item is self-contained with context ---

function buildNarration(n: Narrative, depth: "full" | "brief"): string {
  const lead = n.events[0];
  if (!lead) return n.headline;

  if (depth === "brief") return buildBriefNarration(n, lead);
  return buildFullNarration(n, lead);
}

function buildFullNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const src = sourceFriendlyName(lead.source);

  if (lead.source === "gawk-sdk") {
    return buildSDKNarration(n, lead);
  }
  if (lead.source === "gawk-models") {
    return buildModelNarration(n, lead);
  }
  if (lead.source === "github-trending") {
    return buildGitHubNarration(n, lead);
  }
  if (lead.source === "arxiv") {
    return buildArxivNarration(n, lead);
  }
  if (lead.source === "hn") {
    return buildHNNarration(n, lead);
  }
  if (lead.source === "reddit") {
    return buildRedditNarration(n, lead);
  }

  return buildGenericNarration(n, lead);
}

function cleanSummary(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSDKNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const name = lead.title.split(" ")[0];

  if (m.deltaPct !== undefined) {
    const absChange = Math.abs(m.deltaPct).toFixed(0);
    const direction = m.deltaPct < 0 ? "down" : "up";

    const parts = [
      `${name} — a tool for running large language models locally — saw downloads go ${direction} ${absChange} percent this week.`,
    ];
    if (n.events.length > 1) {
      parts.push(`We're tracking ${n.events.length} related signals across package managers.`);
    }
    return parts.join(" ");
  }

  return `${lead.title}. ${cleanSummary(lead.summary)}`;
}

function buildModelNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const modelName = lead.title.split(" ")[0];

  if (m.rank !== undefined && m.previousRank !== undefined && m.previousRank !== null) {
    const moved = m.previousRank - m.rank;
    const direction = moved > 0 ? "up" : "down";
    const positions = Math.abs(moved);

    const parts = [
      `${modelName} moved ${direction} ${positions} spots on the OpenRouter usage leaderboard — now at rank ${m.rank}.`,
      positions > 10
        ? "A shift that large usually reflects developers actively switching workloads."
        : "This tracks real API usage, not benchmarks.",
    ];
    return parts.join(" ");
  }

  return `${lead.title}. ${cleanSummary(lead.summary)}`;
}


function buildGitHubNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const repoName = lead.title.split(" ")[0];
  const summary = lead.summary ? cleanSummary(lead.summary) : "";

  const parts = [
    `${repoName} is trending on GitHub${m.stars && m.stars > 50 ? ` with ${formatNumber(m.stars)} new stars today` : ""}.`,
    summary ? `${summary}.` : "",
  ];

  return parts.filter(Boolean).join(" ");
}

function buildArxivNarration(n: Narrative, lead: ScoredEvent): string {
  const summary = lead.summary ? cleanSummary(simplifyArxivSummary(lead.summary)) : "";
  const parts = [
    `New on ArXiv: "${lead.title}".`,
    summary ? summary + "." : "",
  ];

  return parts.filter(Boolean).join(" ");
}

function simplifyArxivSummary(summary: string): string {
  return summary
    .replace(/We propose /gi, "The researchers propose ")
    .replace(/We introduce /gi, "This paper introduces ")
    .replace(/We present /gi, "The team presents ")
    .replace(/our /gi, "their ")
    .replace(/we /gi, "they ");
}

function buildHNNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const parts: string[] = [];

  parts.push(`${n.headline}.`);

  if (m.points && m.points > 100) {
    parts.push(`${formatNumber(m.points)} points on Hacker News${m.comments ? `, ${m.comments} comments` : ""}.`);
  }

  const summary = lead.summary ? cleanSummary(lead.summary) : "";
  if (summary && !summary.includes(n.headline)) parts.push(summary);

  return parts.join(" ");
}

function buildRedditNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const sub = lead.summary?.match(/r\/(\w+)/)?.[1];
  const summary = lead.summary ? cleanSummary(lead.summary) : "";

  const parts = [
    `${n.headline}.`,
    sub ? `Discussion on r/${sub}${m.points ? ` with ${formatNumber(m.points)} upvotes` : ""}.` : "",
    summary && !summary.includes("r/") && !summary.includes(n.headline) ? summary : "",
  ];

  return parts.filter(Boolean).join(" ");
}

function buildGenericNarration(n: Narrative, lead: ScoredEvent): string {
  const summary = lead.summary ? cleanSummary(lead.summary) : "";
  const parts = [
    `${n.headline}.`,
    summary ? summary : "",
  ];

  return parts.filter(Boolean).join(" ");
}

function buildBriefNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;

  if (lead.source === "gawk-sdk" && m.deltaPct !== undefined) {
    const direction = m.deltaPct < 0 ? "down" : "up";
    return `${lead.title.split(" ")[0]} downloads ${direction} ${Math.abs(m.deltaPct).toFixed(0)} percent — a notable shift in developer adoption.`;
  }

  if (lead.source === "gawk-models" && m.rank !== undefined && m.previousRank !== undefined) {
    return `${lead.title.split(" ")[0]} has moved from rank ${m.previousRank} to ${m.rank} on the AI models leaderboard.`;
  }

  if (lead.source === "github-trending" && m.stars) {
    return `${lead.title.split(" ")[0]} is trending on GitHub with ${formatNumber(m.stars)} new stars today.`;
  }

  const summary = lead.summary ? cleanSummary(lead.summary) : "";
  return `${n.headline}.${summary ? " " + summary : ""}`;
}

// --- Word budget ---

const WORDS_PER_SEC = 2.5; // ~150 words/min for Edge TTS at normal rate
const PADDING_SEC = 1.0; // leave breathing room at end of each segment

function wordBudget(availableSec: number): number {
  return Math.max(5, Math.floor((availableSec - PADDING_SEC) * WORDS_PER_SEC));
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function trimToWordBudget(text: string, budget: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= budget) return text;
  const trimmed = words.slice(0, budget).join(" ");
  return trimmed.replace(/[,\s]+$/, "") + ".";
}

// --- TTS ---

function generateTTS(text: string, outFile: string): number {
  const escaped = text.replace(/"/g, '\\"').replace(/`/g, "");
  try {
    execSync(
      `${EDGE_TTS} --voice "${VOICE}" --text "${escaped}" --write-media "${outFile}" 2>&1`,
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

function concatenateAudio(segments: NarrationSegment[], outFile: string, manifest: ManifestEntry[]) {
  const listFile = resolve(ROOT, "out/concat-list.txt");
  const lines: string[] = [];

  if (manifest.length > 0) {
    // Manifest mode: place each segment at its video start time using silence gaps
    let cursor = 0;
    for (const seg of segments) {
      const m = manifest.find((e) => e.id === seg.id);
      const targetStart = m ? m.startSec : cursor;

      const gap = targetStart - cursor;
      if (gap > 0.05) {
        const gapFile = resolve(ROOT, `out/silence-${seg.id}.mp3`);
        execSync(
          `ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${gap.toFixed(3)} -c:a libmp3lame -b:a 192k "${gapFile}" 2>&1`
        );
        lines.push(`file '${gapFile}'`);
        cursor += gap;
      }

      lines.push(`file '${seg.audioFile}'`);
      cursor += seg.durationSec;
    }
  } else {
    // Standalone mode: simple concatenation with 0.8s pauses
    const silenceFile = resolve(ROOT, "out/silence-0.8s.mp3");
    execSync(
      `ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t 0.8 -c:a libmp3lame -b:a 192k "${silenceFile}" 2>&1`
    );
    for (let i = 0; i < segments.length; i++) {
      lines.push(`file '${segments[i].audioFile}'`);
      if (i < segments.length - 1) {
        lines.push(`file '${silenceFile}'`);
      }
    }
  }

  writeFileSync(listFile, lines.join("\n"));

  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:a libmp3lame -b:a 192k "${outFile}" 2>&1`,
    { timeout: 60_000 }
  );

  const probe = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outFile}" 2>&1`
  ).toString().trim();
  console.log(`\nFull narration: ${outFile} (${parseFloat(probe).toFixed(1)}s)`);
}

// --- Format configs ---

type FormatConfig = {
  maxItems: number;
  depth: "full" | "brief";
  introStyle: "full" | "short";
  outroStyle: "full" | "short";
};

const FORMAT_CONFIGS: Record<string, FormatConfig> = {
  youtube: { maxItems: 20, depth: "full", introStyle: "full", outroStyle: "full" },
  linkedin: { maxItems: 5, depth: "brief", introStyle: "short", outroStyle: "short" },
  instagram: { maxItems: 4, depth: "brief", introStyle: "short", outroStyle: "short" },
};

function main() {
  if (!existsSync(CURATED)) {
    console.error(`Missing: ${CURATED}\nRun: npm run video:curate --max 20`);
    process.exit(1);
  }

  const config = FORMAT_CONFIGS[FORMAT] ?? FORMAT_CONFIGS.youtube;
  const curated: CurationResult = JSON.parse(readFileSync(CURATED, "utf-8"));
  const narratives = curated.narratives.slice(0, config.maxItems);

  const manifestPath = resolve(ROOT, `data/video-manifest-${FORMAT}.json`);
  const hasManifest = existsSync(manifestPath);
  let manifest: ManifestEntry[] = [];

  if (hasManifest) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    console.log(`Video-first mode: reading manifest (${manifest.length} segments)`);
  } else {
    console.log("Standalone mode: no video manifest found — generating unconstrained narration");
  }

  function manifestFor(id: string): ManifestEntry | undefined {
    return manifest.find((m) => m.id === id);
  }

  function availableSec(id: string, fallback: number): number {
    const m = manifestFor(id);
    if (!m) return fallback;
    return m.endSec - m.startSec;
  }

  console.log(`Format: ${FORMAT} | ${narratives.length} items | depth: ${config.depth}\n`);

  const segments: NarrationSegment[] = [];

  // Intro
  const introAvail = availableSec("intro", 20);
  const introBudget = wordBudget(introAvail);
  let introText = config.introStyle === "full"
    ? `Good ${getTimeOfDay()}. This is Gawk Daily for ${DATE_SPOKEN}. Here's what moved in AI today.`
    : `Gawk Daily, ${DATE_SPOKEN}.`;

  if (hasManifest) {
    introText = trimToWordBudget(introText, introBudget);
    console.log(`[INTRO] Budget: ${introBudget} words (${introAvail.toFixed(1)}s avail)`);
  }

  const introFile = resolve(ROOT, "out/narration-seg-intro.mp3");
  console.log("[INTRO] Generating...");
  const introDur = generateTTS(introText, introFile);

  if (hasManifest && introDur > introAvail) {
    console.warn(`  ⚠ TTS ${introDur.toFixed(1)}s exceeds segment ${introAvail.toFixed(1)}s — trimming`);
    const tighterBudget = Math.floor(introBudget * (introAvail / introDur));
    introText = trimToWordBudget(introText, tighterBudget);
    const retryDur = generateTTS(introText, introFile);
    segments.push({
      id: "intro", segment: "intro", headline: "Intro",
      narration: introText, scene: "globe", audioFile: introFile, durationSec: retryDur,
    });
    console.log(`  Retried: ${retryDur.toFixed(1)}s`);
  } else {
    segments.push({
      id: "intro", segment: "intro", headline: "Intro",
      narration: introText, scene: "globe", audioFile: introFile, durationSec: introDur,
    });
    console.log(`  ${introDur.toFixed(1)}s\n`);
  }

  // Content
  for (let idx = 0; idx < narratives.length; idx++) {
    const narrative = narratives[idx];
    const segAvail = availableSec(narrative.id, 20);
    const segBudget = wordBudget(segAvail);

    const rawNarration = buildNarration(narrative, config.depth);
    const transition = idx > 0 ? `${getTransition(idx)} ` : "";
    let narration = `${transition}${rawNarration}`;

    if (hasManifest) {
      narration = trimToWordBudget(narration, segBudget);
    }

    const scene = sourceToPanel(narrative.events[0]?.source ?? "");
    const segFile = resolve(ROOT, `out/narration-seg-${narrative.id}.mp3`);

    const budgetInfo = hasManifest ? ` [${wordCount(narration)}/${segBudget}w, ${segAvail.toFixed(1)}s]` : "";
    console.log(`[${narrative.segment.toUpperCase().padEnd(9)}] ${narrative.headline.slice(0, 55)}${budgetInfo}`);

    let dur = generateTTS(narration, segFile);

    if (hasManifest && dur > segAvail) {
      console.warn(`  ⚠ TTS ${dur.toFixed(1)}s exceeds segment ${segAvail.toFixed(1)}s — trimming`);
      const tighterBudget = Math.floor(segBudget * (segAvail / dur));
      narration = trimToWordBudget(narration, tighterBudget);
      dur = generateTTS(narration, segFile);
      console.log(`  Retried: ${dur.toFixed(1)}s (${wordCount(narration)} words)`);
    }

    segments.push({
      id: narrative.id, segment: narrative.segment, headline: narrative.headline,
      narration, scene, audioFile: segFile, durationSec: dur,
    });
    console.log(`  ${dur.toFixed(1)}s → ${scene}`);
  }

  // Outro
  const outroAvail = availableSec("outro", 25);
  const outroBudget = wordBudget(outroAvail);
  let outroText = config.outroStyle === "full"
    ? `That's the briefing for ${DATE_SPOKEN}. Every number on gawk dot dev links to its public source. Subscribe for tomorrow's update.`
    : `Gawk Daily for ${DATE_SPOKEN}. More at gawk dot dev.`;

  if (hasManifest) {
    outroText = trimToWordBudget(outroText, outroBudget);
    console.log(`\n[OUTRO] Budget: ${outroBudget} words (${outroAvail.toFixed(1)}s avail)`);
  }

  const outroFile = resolve(ROOT, "out/narration-seg-outro.mp3");
  console.log(`[OUTRO] Generating...`);
  let outroDur = generateTTS(outroText, outroFile);

  if (hasManifest && outroDur > outroAvail) {
    console.warn(`  ⚠ TTS ${outroDur.toFixed(1)}s exceeds segment ${outroAvail.toFixed(1)}s — trimming`);
    const tighterBudget = Math.floor(outroBudget * (outroAvail / outroDur));
    outroText = trimToWordBudget(outroText, tighterBudget);
    outroDur = generateTTS(outroText, outroFile);
    console.log(`  Retried: ${outroDur.toFixed(1)}s`);
  }

  segments.push({
    id: "outro", segment: "outro", headline: "Outro",
    narration: outroText, scene: "globe", audioFile: outroFile, durationSec: outroDur,
  });
  console.log(`  ${outroDur.toFixed(1)}s`);

  // Summary
  const totalDur = segments.reduce((sum, s) => sum + s.durationSec, 0);
  const pauses = (segments.length - 1) * 0.8;
  console.log(`\nTotal: ${totalDur.toFixed(1)}s narration + ${pauses.toFixed(1)}s pauses = ${(totalDur + pauses).toFixed(1)}s`);

  if (hasManifest) {
    const videoDur = manifest[manifest.length - 1]?.endSec ?? 0;
    const fit = totalDur + pauses;
    const delta = videoDur - fit;
    console.log(`Video duration: ${videoDur.toFixed(1)}s | Narration fit: ${delta > 0 ? "+" : ""}${delta.toFixed(1)}s ${delta >= 0 ? "✓" : "⚠ OVERRUN"}`);
  }

  // Concatenate
  const fullAudio = resolve(ROOT, `data/video-narration-${FORMAT}.mp3`);
  concatenateAudio(segments, fullAudio, manifest);

  // Also write to default path for compositor
  if (FORMAT === "youtube") {
    execSync(`cp "${fullAudio}" "${resolve(ROOT, "data/video-narration.mp3")}"`);
  }

  // Segment data — include manifest timing for compositor
  const segmentData = segments.map(({ audioFile, ...rest }) => {
    const m = manifestFor(rest.id);
    return {
      ...rest,
      audioFile: audioFile.replace(ROOT + "/", ""),
      ...(m ? { videoStartSec: m.startSec, videoEndSec: m.endSec } : {}),
    };
  });
  const outPath = resolve(ROOT, `data/narration-segments-${FORMAT}.json`);
  writeFileSync(outPath, JSON.stringify(segmentData, null, 2));
  console.log(`Segments: ${outPath}`);
}

main();
