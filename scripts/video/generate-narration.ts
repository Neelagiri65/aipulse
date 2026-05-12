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
const BASE_RATE = 12; // baseline speed boost (percent) — punchier delivery
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

// --- LLM-powered script generation ---

function generateScriptWithLLM(narratives: Narrative[], manifest: ManifestEntry[]): Record<string, string> | null {
  try {
    execSync("ollama list 2>/dev/null", { timeout: 5000 });
  } catch {
    return null;
  }

  const stories = narratives.map((n, i) => {
    const lead = n.events[0];
    const m = lead?.metrics ?? {};
    const avail = manifest.find((e) => e.id === n.id);
    const secs = avail ? (avail.endSec - avail.startSec) : 8;
    const maxWords = Math.floor(secs * 2.8);
    const minWords = Math.floor(secs * 2);

    let context = `Headline: ${n.headline}`;
    if (m.deltaPct !== undefined) context += `\nData: ${Math.abs(m.deltaPct).toFixed(0)}% ${m.deltaPct < 0 ? "decline" : "increase"} in downloads week-over-week`;
    if (m.rank !== undefined && m.previousRank !== undefined) context += `\nData: Moved from rank ${m.previousRank} to rank ${m.rank} (real API usage data from OpenRouter)`;
    if (m.stars !== undefined) context += `\nData: ${m.stars} GitHub stars in one day`;
    if (m.points !== undefined) context += `\nData: ${m.points} points on Hacker News`;
    if (lead?.source) context += `\nSource: ${lead.source.replace("gawk-", "").replace("github-trending", "GitHub")}`;
    context += `\nTarget: ${minWords}-${maxWords} words (fill the time, don't be sparse)`;

    return `[${i}] ${context}`;
  }).join("\n\n");

  const prompt = `You are writing a voiceover script for a 2-minute AI news video called "Gawk Daily".

VOICE: Confident tech analyst. Like a Bloomberg anchor who also ships code. Short punchy sentences. No filler. No "let's dive in" or "interesting to see". Never read the headline verbatim — rephrase with insight.

RULES:
- Each segment is spoken over video. Hit the target word count — don't be sparse.
- Explain WHY something matters, not just WHAT happened. Add one sentence of genuine insight.
- For download drops: what does this mean for the ecosystem?
- For rank changes: why are developers switching?
- For GitHub trending: what problem does this solve?
- For HN/Reddit: what's the actual insight from the discussion, not just that it exists?
- For tools/bots people built: what's clever about the approach?
- No "discussion on Reddit" or "trending on HN" — that's obvious from the video. Say what's BEING discussed.
- Never say percentages over 100% for declines — just say "collapsed" or "cratered"
- Don't repeat the same structure. Vary sentence patterns.

STORIES:
${stories}

OUTPUT FORMAT: Return ONLY a JSON object with numeric keys mapping to the narration text for each story. Example:
{"0": "narration for story 0", "1": "narration for story 1"}

Do not include intro or outro — just the numbered stories.`;

  console.log("\n  Generating script via LLM (qwen2.5:7b)...");
  try {
    const body = JSON.stringify({
      model: "qwen2.5:7b",
      prompt,
      format: "json",
      stream: false,
      options: { temperature: 0.7, num_predict: 2048 },
    });

    const result = execSync(
      `curl -s http://localhost:11434/api/generate -d '${body.replace(/'/g, "'\\''")}'`,
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
    ).toString().trim();

    const apiResponse = JSON.parse(result);
    if (!apiResponse.response) {
      console.warn("  LLM returned empty response — falling back to templates");
      return null;
    }

    const cleanedJson = apiResponse.response
      .replace(/[\x00-\x1f\x7f]/g, (ch: string) => ch === "\n" || ch === "\t" ? " " : "")
      .replace(/\s+/g, " ")
      .trim();

    const parsed = JSON.parse(cleanedJson);
    console.log("  LLM script generated successfully\n");
    return parsed;
  } catch (e) {
    console.warn("  LLM generation failed — falling back to templates:", (e as Error).message?.slice(0, 80));
    return null;
  }
}

// --- Template-based fallback narration builders ---

function buildNarration(n: Narrative, depth: "full" | "brief"): string {
  const lead = n.events[0];
  if (!lead) return n.headline;

  if (depth === "brief") return buildBriefNarration(n, lead);
  return buildFullNarration(n, lead);
}

function buildFullNarration(n: Narrative, lead: ScoredEvent): string {
  if (lead.source === "gawk-sdk") return buildSDKNarration(n, lead);
  if (lead.source === "gawk-models") return buildModelNarration(n, lead);
  if (lead.source === "github-trending") return buildGitHubNarration(n, lead);
  if (lead.source === "arxiv") return buildArxivNarration(n, lead);
  if (lead.source === "hn") return buildHNNarration(n, lead);
  if (lead.source === "reddit") return buildRedditNarration(n, lead);
  return buildGenericNarration(n, lead);
}

function cleanSummary(text: string): string {
  let cleaned = text
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/Star\s+[\w-]+\s*\/\s*[\w-]+\s*/gi, "")
    .replace(/\d+\s*points?,?\s*\d+\s*comments?\.?/gi, "")
    .replace(/\d+\s*upvotes?\.?/gi, "")
    .replace(/Discussion on r\/\w+\.?/gi, "")
    .replace(/·/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1) cleaned = sentences[0];
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).replace(/[,\s]+$/, "");

  return cleaned;
}

function getUsableSummary(lead: ScoredEvent, headline: string): string {
  if (!lead.summary) return "";
  const cleaned = cleanSummary(lead.summary);
  if (cleaned.length < 15 || cleaned.includes(headline)) return "";
  return cleaned;
}

function buildSDKNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const name = lead.title.split(" ")[0];

  if (m.deltaPct !== undefined) {
    const abs = Math.abs(m.deltaPct);
    if (m.deltaPct < 0) {
      if (abs > 80) return `${name} downloads just cratered. Developers are clearly moving away from this tool.`;
      if (abs > 30) return `${name} losing ground — downloads down ${abs.toFixed(0)} percent. A better alternative may have landed.`;
      return `${name} downloads slipped ${abs.toFixed(0)} percent. Worth watching.`;
    }
    if (abs > 100) return `${name} downloads more than doubled. Something upstream changed.`;
    if (abs > 50) return `${name} surging — up ${abs.toFixed(0)} percent. Developer momentum is here.`;
    return `${name} quietly climbing, up ${abs.toFixed(0)} percent.`;
  }
  return n.headline;
}

function buildModelNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const modelName = lead.title.split(" ")[0];

  if (m.rank !== undefined && m.previousRank !== undefined && m.previousRank !== null) {
    const moved = m.previousRank - m.rank;
    const positions = Math.abs(moved);

    if (moved > 10) return `${modelName} jumped ${positions} spots to rank ${m.rank} on OpenRouter. Not benchmarks — real API traffic. Developers are voting with their tokens.`;
    if (moved > 0) return `${modelName} climbing to rank ${m.rank} on OpenRouter. Real workload gains.`;
    if (moved < -10) return `${modelName} dropped ${positions} spots to rank ${m.rank} on OpenRouter. Developers are migrating away.`;
    return `${modelName} slipping to rank ${m.rank}. Real usage telling a different story.`;
  }
  return n.headline;
}

function buildGitHubNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const repoName = lead.title.split(" ")[0];

  if (m.stars && m.stars > 100) {
    return `${repoName} exploded on GitHub — ${formatNumber(m.stars)} stars in a day. The community is rallying around this one.`;
  }
  if (m.stars && m.stars > 30) {
    return `${repoName} trending on GitHub with ${formatNumber(m.stars)} stars today. Worth bookmarking.`;
  }
  if (m.stars) {
    return `${repoName} picking up ${formatNumber(m.stars)} stars on GitHub today. Early traction building.`;
  }
  return `${repoName} making the trending list on GitHub. One to watch.`;
}

function buildArxivNarration(n: Narrative, lead: ScoredEvent): string {
  const summary = getUsableSummary(lead, n.headline);
  if (summary) {
    return `From the research side — ${n.headline}. ${summary}. This is the kind of work that shows up in production six months from now.`;
  }
  return `New research worth flagging: ${n.headline}. Keep this one on your radar.`;
}

let hnPhraseIdx = 0;
const HN_PHRASES = [
  "lighting up on Hacker News",
  "driving serious discussion on Hacker News",
  "trending on Hacker News right now",
  "turning heads on Hacker News",
];

function buildHNNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const summary = getUsableSummary(lead, n.headline);
  const phrase = HN_PHRASES[hnPhraseIdx++ % HN_PHRASES.length];

  if (m.points && m.points > 200) {
    return `${n.headline} — ${phrase}.${summary ? ` ${summary}.` : ""}`;
  }
  if (m.points && m.points > 100) {
    return `${n.headline} — ${phrase}.${summary ? ` ${summary}.` : ""}`;
  }
  return `${n.headline} — active conversation on Hacker News.${summary ? ` ${summary}.` : ""}`;
}

function buildRedditNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const sub = lead.summary?.match(/r\/(\w+)/)?.[1];
  const subName = sub ? `r/${sub}` : "Reddit";

  if (m.points && m.points > 500) return `${n.headline} — blowing up on ${subName}. The community has strong opinions on this one.`;
  if (m.points && m.points > 100) return `${n.headline} — sparking real conversation on ${subName}.`;
  return `${n.headline} — getting traction on ${subName}.`;
}

function buildGenericNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;
  const h = n.headline;

  if (m.rank !== undefined && m.previousRank !== undefined) {
    const moved = m.previousRank - m.rank;
    const positions = Math.abs(moved);
    if (moved < -5) return `${h.split(":")[0] || h} dropped ${positions} spots. Developers are moving on.`;
    if (moved > 5) return `${h.split(":")[0] || h} climbing ${positions} spots. Worth watching.`;
  }

  if (m.eventCount && m.eventCount > 100) {
    return `${h}. That level of activity stands out.`;
  }

  const claudePhrases = [
    "The Claude ecosystem keeps growing.",
    "More developers building on Claude.",
    "Anthropic's developer community is active.",
  ];
  const openaiPhrases = [
    "OpenAI's community is reacting.",
    "The GPT ecosystem shifting.",
    "Worth watching how this plays out.",
  ];

  if (h.toLowerCase().includes("claude") || h.toLowerCase().includes("anthropic")) {
    return `${h}. ${claudePhrases[Math.floor(Math.random() * claudePhrases.length)]}`;
  }
  if (h.toLowerCase().includes("chatgpt") || h.toLowerCase().includes("openai")) {
    return `${h}. ${openaiPhrases[Math.floor(Math.random() * openaiPhrases.length)]}`;
  }
  if (h.toLowerCase().includes("built") || h.toLowerCase().includes("made")) {
    return `${h}. Developers shipping real tools with AI.`;
  }
  if (h.toLowerCase().includes("learning") || h.toLowerCase().includes("understanding")) {
    return `${h}. The human side of working with AI.`;
  }

  return `${h}.`;
}

function buildBriefNarration(n: Narrative, lead: ScoredEvent): string {
  const m = lead.metrics;

  if (lead.source === "gawk-sdk" && m.deltaPct !== undefined) {
    const abs = Math.abs(m.deltaPct);
    if (m.deltaPct < 0 && abs > 80) return `${lead.title.split(" ")[0]} downloads collapsed.`;
    return `${lead.title.split(" ")[0]} downloads ${m.deltaPct < 0 ? "dropping" : "surging"}.`;
  }

  if (lead.source === "gawk-models" && m.rank !== undefined && m.previousRank !== undefined) {
    return `${lead.title.split(" ")[0]} now rank ${m.rank} on OpenRouter.`;
  }

  if (lead.source === "github-trending" && m.stars) {
    return `${lead.title.split(" ")[0]} trending, ${formatNumber(m.stars)} stars today.`;
  }

  return n.headline;
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

  const sentences = text.split(/(?<=[.!?])\s+/);
  let result = "";
  for (const sentence of sentences) {
    const candidate = result ? `${result} ${sentence}` : sentence;
    if (wordCount(candidate) > budget && result) break;
    result = candidate;
  }

  if (!result || wordCount(result) > budget) {
    result = words.slice(0, budget).join(" ").replace(/[,\s—–-]+$/, "") + ".";
  }

  return result;
}

// --- TTS ---

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
  instagram: { maxItems: 10, depth: "brief", introStyle: "short", outroStyle: "short" },
};

function main() {
  if (!existsSync(CURATED)) {
    console.error(`Missing: ${CURATED}\nRun: npm run video:curate --max 20`);
    process.exit(1);
  }

  const config = FORMAT_CONFIGS[FORMAT] ?? FORMAT_CONFIGS.youtube;
  const curated: CurationResult = JSON.parse(readFileSync(CURATED, "utf-8"));
  let narratives = curated.narratives.slice(0, config.maxItems);

  const manifestPath = resolve(ROOT, `data/video-manifest-${FORMAT}.json`);
  const hasManifest = existsSync(manifestPath);
  let manifest: ManifestEntry[] = [];

  if (hasManifest) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    console.log(`Video-first mode: reading manifest (${manifest.length} segments)`);
    const manifestIds = new Set(manifest.map((m) => m.id));
    narratives = narratives.filter((n) => manifestIds.has(n.id));
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

  console.log(`Format: ${FORMAT} | ${narratives.length} items | depth: ${config.depth}`);

  // Try LLM-powered script generation
  const llmScript = generateScriptWithLLM(narratives, manifest);
  if (llmScript) {
    console.log("  Using LLM-generated narration script");
  } else {
    console.log("  Using template-based narration\n");
  }

  const segments: NarrationSegment[] = [];

  // Intro
  const introAvail = availableSec("intro", 20);
  const introText = config.introStyle === "full"
    ? `Gawk Daily, ${DATE_SPOKEN}. Here's what moved.`
    : `Gawk Daily, ${DATE_SPOKEN}.`;

  console.log(`[INTRO] ${wordCount(introText)} words (${introAvail.toFixed(1)}s avail)`);

  const introFile = resolve(ROOT, "out/narration-seg-intro.mp3");
  console.log("[INTRO] Generating...");
  const introDur = generateTTS(introText, introFile);

  if (hasManifest && introDur > introAvail) {
    const speedUp = Math.min(40, Math.round(((introDur / introAvail) - 1) * 100) + 10);
    console.log(`  ⚠ ${introDur.toFixed(1)}s > ${introAvail.toFixed(1)}s — retrying at +${speedUp}% rate`);
    const retryDur = generateTTS(introText, introFile, speedUp);
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

    let narration: string;
    if (llmScript && llmScript[String(idx)]) {
      narration = llmScript[String(idx)];
    } else {
      const rawNarration = buildNarration(narrative, config.depth);
      const transition = idx > 0 ? `${getTransition(idx)} ` : "";
      narration = `${transition}${rawNarration}`.trim();
    }

    const scene = sourceToPanel(narrative.events[0]?.source ?? "");
    const segFile = resolve(ROOT, `out/narration-seg-${narrative.id}.mp3`);

    const info = hasManifest ? ` [${wordCount(narration)}w, ${segAvail.toFixed(1)}s]` : "";
    console.log(`[${narrative.segment.toUpperCase().padEnd(9)}] ${narrative.headline.slice(0, 55)}${info}`);

    let dur = generateTTS(narration, segFile);

    if (hasManifest && dur > segAvail) {
      const speedUp = Math.min(40, Math.round(((dur / segAvail) - 1) * 100) + 10);
      console.log(`  ⚠ ${dur.toFixed(1)}s > ${segAvail.toFixed(1)}s — speeding up +${speedUp}%`);
      dur = generateTTS(narration, segFile, speedUp);
      console.log(`  → ${dur.toFixed(1)}s (${wordCount(narration)} words)`);
    }

    segments.push({
      id: narrative.id, segment: narrative.segment, headline: narrative.headline,
      narration, scene, audioFile: segFile, durationSec: dur,
    });
    console.log(`  ${dur.toFixed(1)}s → ${scene}`);
  }

  // Outro
  const outroAvail = availableSec("outro", 25);
  const outroText = config.outroStyle === "full"
    ? `That's the briefing for ${DATE_SPOKEN}. Every number on gawk dot dev links to its public source. Subscribe for tomorrow's update.`
    : `Gawk Daily for ${DATE_SPOKEN}. More at gawk dot dev.`;

  console.log(`\n[OUTRO] ${wordCount(outroText)} words (${outroAvail.toFixed(1)}s avail)`);

  const outroFile = resolve(ROOT, "out/narration-seg-outro.mp3");
  console.log(`[OUTRO] Generating...`);
  let outroDur = generateTTS(outroText, outroFile);

  if (hasManifest && outroDur > outroAvail) {
    const speedUp = Math.min(40, Math.round(((outroDur / outroAvail) - 1) * 100) + 10);
    console.log(`  ⚠ ${outroDur.toFixed(1)}s > ${outroAvail.toFixed(1)}s — speeding up +${speedUp}%`);
    outroDur = generateTTS(outroText, outroFile, speedUp);
    console.log(`  → ${outroDur.toFixed(1)}s`);
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
