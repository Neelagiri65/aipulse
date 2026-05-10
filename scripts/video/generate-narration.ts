/**
 * Generates broadcast narration from curated.json + Edge TTS audio per segment.
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

const ROOT = process.cwd();
const CURATED = resolve(ROOT, "data/curated.json");
const VOICE = "en-AU-WilliamMultilingualNeural";
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
  "Moving on.",
  "Next up.",
  "Shifting gears.",
  "Also worth noting...",
  "Here's something interesting.",
  "Now...",
  "Meanwhile...",
  "On a related note...",
  "Switching tracks.",
  "And this one's worth your attention.",
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
    "gawk-models": "the Gawk models leaderboard",
    "gawk-tools": "Gawk tool health monitoring",
    "gawk-sdk": "the Gawk SDK adoption tracker",
    "gawk-labs": "the Gawk labs directory",
    "gawk-wire": "the Gawk wire feed",
    hn: "Hacker News",
    reddit: "Reddit",
    arxiv: "ArXiv",
    gdelt: "the GDELT global event database",
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

function buildSDKNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const name = lead.title.split(" ")[0];

  if (m.deltaPct !== undefined) {
    const absChange = Math.abs(m.deltaPct).toFixed(0);
    const direction = m.deltaPct < 0 ? "dropped" : "surged";

    return [
      `${name}... the tool that lets you run large language models locally on your own hardware.`,
      `Downloads have ${direction} — by ${absChange} percent.`,
      `That's not a small fluctuation. That's a signal.`,
      `When install rates shift this sharply... it usually means developers are either flocking to something new, or moving away from it.`,
      n.events.length > 1 ? `We're seeing ${n.events.length} related signals reinforcing this trend.` : "",
    ].filter(Boolean).join(" ");
  }

  return `${lead.title}. ${lead.summary}`;
}

function buildModelNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const titleParts = lead.title.split(":");
  const labName = titleParts.length > 1 ? titleParts[0].trim() : "";
  const modelName = lead.title.split(" ")[0];

  if (m.rank !== undefined && m.previousRank !== undefined && m.previousRank !== null) {
    const moved = m.previousRank - m.rank;
    const direction = moved > 0 ? "climbed" : "dropped";
    const positions = Math.abs(moved);

    const parts = [
      `${modelName}${labName ? ` — that's ${labName}'s ${describeModelType(lead.title)}` : ""} — has ${direction} ${positions} positions on the leaderboard.`,
      positions > 10
        ? `That's a significant move. It tells us developers are actively switching their workloads... and when that many people change direction at once, it's worth paying attention to.`
        : `The leaderboard tracks real usage across OpenRouter, so this reflects actual developer choices — not just benchmarks.`,
    ];
    return parts.join(" ");
  }

  return `${lead.title}. ${lead.summary}`;
}

function describeModelType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("preview")) return "preview model";
  if (lower.includes("vision")) return "vision model";
  if (lower.includes("reasoning")) return "reasoning model";
  if (lower.includes("instruct")) return "instruction-tuned model";
  if (lower.includes("chat")) return "chat model";
  return "language model";
}

function buildGitHubNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const repoName = lead.title.split(" ")[0];

  const parts = [
    `On GitHub... ${repoName} is trending${m.stars && m.stars > 50 ? ` — picking up ${formatNumber(m.stars)} stars in a single day` : ""}.`,
    lead.summary ? `${lead.summary}.` : "",
    `When a project trends on GitHub, it means developers aren't just looking — they're bookmarking it for use.`,
  ];

  return parts.filter(Boolean).join(" ");
}

function buildArxivNarration(n: Narrative, lead: ScoredEvent): string {
  const title = lead.title;

  const parts = [
    `From the research side... a new paper: "${title}".`,
    lead.summary ? `In simpler terms — ${simplifyArxivSummary(lead.summary)}.` : "",
    `This is pre-print research, meaning it hasn't been peer reviewed yet. But the ideas published on ArXiv today often become the products you use six months from now.`,
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

  parts.push(`From Hacker News: ${n.headline}.`);

  if (m.points && m.points > 300) {
    parts.push(`This is one of the highest-engagement posts today, which means the developer community considers this significant.`);
  }

  parts.push(explainWhyItMatters(n.headline, lead));

  return parts.join(" ");
}

function buildRedditNarration(n: Narrative, lead: ScoredEvent): string {
  const parts: string[] = [];
  const sub = lead.summary?.match(/r\/(\w+)/)?.[1] ?? "technology";

  parts.push(`From the ${sub} community on Reddit: ${n.headline}.`);
  parts.push(explainWhyItMatters(n.headline, lead));

  return parts.join(" ");
}

function explainWhyItMatters(headline: string, lead: ScoredEvent): string {
  const lower = headline.toLowerCase();

  if (lower.includes("claude code") || lower.includes("claude"))
    return "Anthropic's Claude Code has been gaining traction as a coding assistant, and developer experiences like this help the community understand where it excels and where it falls short compared to alternatives.";
  if (lower.includes("chatgpt") || lower.includes("gpt"))
    return "OpenAI's ChatGPT continues to evolve rapidly, and real-world user reports like this provide the most honest assessment of what these models can actually do in practice.";
  if (lower.includes("exploit") || lower.includes("cve") || lower.includes("vulnerability"))
    return "Security vulnerabilities at the kernel level have direct implications for AI infrastructure, since most AI workloads run on Linux servers. A root exploit means every data centre running unpatched systems is potentially exposed.";
  if (lower.includes("llama") || lower.includes("quantiz") || lower.includes("gguf"))
    return "Advances in model quantization and local inference are making it possible to run increasingly capable models on consumer hardware, which democratises access to AI capabilities.";
  if (lower.includes("nvidia"))
    return "NVIDIA continues to shape the AI hardware and software landscape. Their releases often set the direction for what developers can build in the coming months.";
  if (lower.includes("leaderboard") || lower.includes("benchmark"))
    return "Leaderboard positioning influences which models developers choose for production. Understanding the limitations of these rankings helps teams make better decisions.";
  if (lower.includes("mcp") || lower.includes("telegram") || lower.includes("bot"))
    return "The developer community is building real tools around these AI platforms, which shows the ecosystem maturing beyond experimentation into practical daily use.";
  if (lower.includes("anthropic") || lower.includes("github activity"))
    return "Tracking open source activity from major AI labs gives insight into where they're investing engineering effort, which often previews upcoming product directions.";

  if (lead.summary) return lead.summary;
  return "This is worth watching as the AI ecosystem continues to evolve rapidly.";
}

function buildGenericNarration(n: Narrative, lead: ScoredEvent): string {
  const src = sourceFriendlyName(lead.source);
  const parts: string[] = [];

  parts.push(`From ${src}: ${n.headline}.`);
  if (lead.summary) parts.push(lead.summary);

  return parts.join(" ");
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

  return `${n.headline}.${lead.summary ? " " + lead.summary : ""}`;
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

function concatenateAudio(segments: NarrationSegment[], outFile: string) {
  const listFile = resolve(ROOT, "out/concat-list.txt");
  const silenceFile = resolve(ROOT, "out/silence-0.8s.mp3");

  execSync(
    `ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t 0.8 -c:a libmp3lame -b:a 192k "${silenceFile}" 2>&1`
  );

  const lines: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    lines.push(`file '${segments[i].audioFile}'`);
    if (i < segments.length - 1) {
      lines.push(`file '${silenceFile}'`);
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

  console.log(`Format: ${FORMAT} | ${narratives.length} items | depth: ${config.depth}\n`);

  const segments: NarrationSegment[] = [];

  // Intro
  const introText = config.introStyle === "full"
    ? `Good ${getTimeOfDay()}. This is Gawk Daily for ${DATE_SPOKEN}... your no-spin briefing on what's actually moving in the AI world. Every number you'll hear today comes from public data — nothing invented, nothing speculated. Let's get into it.`
    : `Gawk Daily, ${DATE_SPOKEN}. Here's what's happening in AI right now.`;

  const introFile = resolve(ROOT, "out/narration-seg-intro.mp3");
  console.log("[INTRO] Generating...");
  const introDur = generateTTS(introText, introFile);
  segments.push({
    id: "intro", segment: "intro", headline: "Intro",
    narration: introText, scene: "globe", audioFile: introFile, durationSec: introDur,
  });
  console.log(`  ${introDur.toFixed(1)}s\n`);

  // Content
  for (let idx = 0; idx < narratives.length; idx++) {
    const narrative = narratives[idx];
    const rawNarration = buildNarration(narrative, config.depth);
    const transition = idx > 0 ? `${getTransition(idx)} ` : "";
    const narration = `${transition}${rawNarration}`;
    const scene = sourceToPanel(narrative.events[0]?.source ?? "");
    const segFile = resolve(ROOT, `out/narration-seg-${narrative.id}.mp3`);

    console.log(`[${narrative.segment.toUpperCase().padEnd(9)}] ${narrative.headline.slice(0, 70)}`);
    const dur = generateTTS(narration, segFile);

    segments.push({
      id: narrative.id, segment: narrative.segment, headline: narrative.headline,
      narration, scene, audioFile: segFile, durationSec: dur,
    });
    console.log(`  ${dur.toFixed(1)}s → ${scene}`);
  }

  // Outro
  const outroText = config.outroStyle === "full"
    ? `And that's your briefing for ${DATE_SPOKEN}. If any of these stories caught your attention... the full dashboard is live at gawk dot dev — every number links back to its source so you can verify it yourself. If you found this useful, hit subscribe — it helps more people find independent AI coverage. And if you think someone else should see this... share it. This is Gawk Daily. See what the AI world actually sees.`
    : `That's Gawk Daily. Full dashboard at gawk dot dev. Subscribe and share if you found this useful.`;

  const outroFile = resolve(ROOT, "out/narration-seg-outro.mp3");
  console.log(`\n[OUTRO] Generating...`);
  const outroDur = generateTTS(outroText, outroFile);
  segments.push({
    id: "outro", segment: "outro", headline: "Outro",
    narration: outroText, scene: "globe", audioFile: outroFile, durationSec: outroDur,
  });
  console.log(`  ${outroDur.toFixed(1)}s`);

  // Summary
  const totalDur = segments.reduce((sum, s) => sum + s.durationSec, 0);
  const pauses = (segments.length - 1) * 0.8;
  console.log(`\nTotal: ${totalDur.toFixed(1)}s narration + ${pauses.toFixed(1)}s pauses = ${(totalDur + pauses).toFixed(1)}s`);

  // Concatenate
  const fullAudio = resolve(ROOT, `data/video-narration-${FORMAT}.mp3`);
  concatenateAudio(segments, fullAudio);

  // Also write to default path for compositor
  if (FORMAT === "youtube") {
    execSync(`cp "${fullAudio}" "${resolve(ROOT, "data/video-narration.mp3")}"`);
  }

  // Segment data for recording script
  const segmentData = segments.map(({ audioFile, ...rest }) => ({
    ...rest,
    audioFile: audioFile.replace(ROOT + "/", ""),
  }));
  const outPath = resolve(ROOT, `data/narration-segments-${FORMAT}.json`);
  writeFileSync(outPath, JSON.stringify(segmentData, null, 2));
  console.log(`Segments: ${outPath}`);
}

main();
