/**
 * Generates a dynamic narration script from video-daily.json.
 *
 * Reads the fetched data, identifies the most impactful changes,
 * and writes narration into each scene. Updates video-daily.json in place.
 *
 * Modes:
 *   Template (default) — deterministic, no external API
 *   LLM (NVIDIA_NIM_KEY or GEMINI_API_KEY) — richer phrasing, same data
 *
 * Usage: npx tsx scripts/video/generate-script.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { VideoData, ModelEntry } from "../../src/video/types";

const DATA_PATH = resolve(process.cwd(), "data/video-daily.json");

function rankDelta(m: ModelEntry): number {
  if (m.previousRank === null) return 0;
  return m.previousRank - m.rank;
}

function formatRankChange(delta: number): string {
  if (delta > 0) return `up ${delta} ${delta === 1 ? "spot" : "spots"}`;
  if (delta < 0) return `down ${Math.abs(delta)} ${Math.abs(delta) === 1 ? "spot" : "spots"}`;
  return "holding steady";
}

function formatPrice(price: number | null): string {
  if (price === null) return "undisclosed pricing";
  if (price < 1) return `$${price.toFixed(2)} per million tokens`;
  return `$${price.toFixed(0)} per million tokens`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function generateHeroNarration(d: VideoData): string {
  const parts: string[] = [];
  parts.push(`Here's what moved in the AI ecosystem on ${formatDate(d.date)}.`);

  if (d.ecosystemStats.totalEvents > 0) {
    parts.push(
      `${d.ecosystemStats.totalEvents.toLocaleString()} events tracked across ${d.ecosystemStats.activeCountries} countries.`
    );
  }

  return parts.join(" ");
}

function generateWalkthroughNarration(d: VideoData): string {
  const segments: string[] = [];

  // --- Map / Regional (first 30s of walkthrough) ---
  const mapParts: string[] = [];
  if (d.topRegion) {
    mapParts.push(
      `${d.topRegion.country} leads today's activity with ${d.topRegion.deltaPct > 0 ? "a " + d.topRegion.deltaPct + " percent surge" : "the highest event volume"}.`
    );
  }
  if (d.mostActiveCity) {
    mapParts.push(`Most active city: ${d.mostActiveCity.city} with ${d.mostActiveCity.count} events.`);
  }
  if (mapParts.length > 0) segments.push(mapParts.join(" "));

  // --- Tool Health (30-45s) ---
  const th = d.toolHealth;
  if (th.total > 0) {
    const degradedTools = th.tools.filter((t) => t.status !== "operational");
    if (degradedTools.length === 0) {
      segments.push(`All ${th.total} AI tools reporting operational.`);
    } else {
      segments.push(
        `${th.operational} of ${th.total} tools operational. ${degradedTools.map((t) => t.name).join(", ")} ${degradedTools.length === 1 ? "is" : "are"} showing issues.`
      );
    }
  }

  // --- Models (45-60s) ---
  const modelParts: string[] = [];
  const topMover = d.biggestMovers[0];
  if (topMover) {
    const delta = rankDelta(topMover);
    if (delta !== 0) {
      modelParts.push(`Biggest mover: ${topMover.shortName}, ${formatRankChange(delta)} to rank ${topMover.rank}.`);
    }
  }
  const leader = d.topModels[0];
  if (leader) {
    const priceStr = leader.promptPrice !== null ? ` at ${formatPrice(leader.promptPrice)}` : "";
    modelParts.push(`${leader.shortName} holds the top spot${priceStr}.`);
  }
  if (d.topModels.length >= 3) {
    const names = d.topModels.slice(1, 4).map((m) => m.shortName);
    modelParts.push(`Followed by ${names.join(", ")}.`);
  }
  if (modelParts.length > 0) segments.push(modelParts.join(" "));

  // --- Wire / HN (60-75s) ---
  if (d.hnTopStory) {
    segments.push(
      `Top on Hacker News: "${d.hnTopStory.title}" with ${d.hnTopStory.points} points.`
    );
  }
  if (d.topCards.length > 0) {
    const card = d.topCards[0];
    segments.push(`Leading wire story: ${card.headline}.`);
  }

  // --- SDK (75-85s) ---
  if (d.sdkMovers.length > 0) {
    const mover = d.sdkMovers[0];
    const dir = mover.diffPct > 0 ? "up" : "down";
    segments.push(
      `SDK spotlight: ${mover.name} downloads ${dir} ${Math.abs(mover.diffPct)} percent on ${mover.registry}.`
    );
  }

  // --- Labs ---
  if (d.topLabs.length > 0) {
    const lab = d.topLabs[0];
    segments.push(
      `Most active lab: ${lab.name} with ${lab.eventCount} events across ${lab.repoCount} repos.`
    );
  }

  return segments.join(" . ");
}

function generateOutroNarration(_d: VideoData): string {
  return "Track it live at gawk dot dev. Subscribe for the daily digest.";
}

async function generateWithLLM(
  d: VideoData,
  templateScript: string,
  provider: "nvidia" | "gemini",
  apiKey: string
): Promise<string> {
  const prompt = `You are a concise tech news anchor. Given the following AI ecosystem data and a template script, rewrite the script to sound natural and engaging. Keep every number exactly as provided — do not round, estimate, or fabricate. Keep it under 250 words total. Use short, punchy sentences.

DATA (JSON):
${JSON.stringify({
  date: d.date,
  topRegion: d.topRegion,
  mostActiveCity: d.mostActiveCity,
  toolHealth: { operational: d.toolHealth.operational, degraded: d.toolHealth.degraded, total: d.toolHealth.total },
  topModels: d.topModels.slice(0, 5).map(m => ({ name: m.shortName, rank: m.rank, previousRank: m.previousRank, promptPrice: m.promptPrice })),
  biggestMovers: d.biggestMovers.slice(0, 3).map(m => ({ name: m.shortName, rank: m.rank, previousRank: m.previousRank })),
  hnTopStory: d.hnTopStory,
  topCard: d.topCards[0] ?? null,
  sdkMovers: d.sdkMovers.slice(0, 3),
  topLabs: d.topLabs.slice(0, 3),
  ecosystemStats: d.ecosystemStats,
}, null, 2)}

TEMPLATE SCRIPT (improve this, keep all numbers exact):
${templateScript}

Return ONLY the rewritten script, nothing else. Three paragraphs: hero (2 sentences), walkthrough (8-10 sentences), outro (1 sentence). Separate with blank lines.`;

  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (provider === "nvidia") {
    url = "https://integrate.api.nvidia.com/v1/chat/completions";
    headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    body = {
      model: "nvidia/nemotron-super",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      temperature: 0.7,
    };
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    headers = { "Content-Type": "application/json" };
    body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn(`LLM call failed (${res.status}): ${err}`);
    console.warn("Falling back to template script.");
    return templateScript;
  }

  const json = await res.json() as Record<string, unknown>;

  if (provider === "nvidia") {
    const choices = (json as { choices?: { message?: { content?: string } }[] }).choices;
    return choices?.[0]?.message?.content?.trim() ?? templateScript;
  } else {
    const candidates = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates;
    return candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? templateScript;
  }
}

async function main() {
  const data: VideoData = JSON.parse(readFileSync(DATA_PATH, "utf-8"));

  // Generate template-based narration
  const heroNarration = generateHeroNarration(data);
  const walkthroughNarration = generateWalkthroughNarration(data);
  const outroNarration = generateOutroNarration(data);

  let templateScript = [heroNarration, walkthroughNarration, outroNarration].join("\n\n");
  console.log("Template script:\n");
  console.log(templateScript);
  console.log(`\n(${templateScript.split(/\s+/).length} words)\n`);

  // Optional: enhance with LLM
  const nvidiaKey = process.env.NVIDIA_NIM_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  let finalScript = templateScript;

  if (nvidiaKey) {
    console.log("Enhancing script with Nvidia NIM...");
    finalScript = await generateWithLLM(data, templateScript, "nvidia", nvidiaKey);
  } else if (geminiKey) {
    console.log("Enhancing script with Gemini Flash...");
    finalScript = await generateWithLLM(data, templateScript, "gemini", geminiKey);
  } else {
    console.log("No LLM key found (NVIDIA_NIM_KEY or GEMINI_API_KEY). Using template script.");
  }

  // Parse the final script into scene narrations
  const paragraphs = finalScript.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const sceneNarrations: Record<string, string> = {
    hero: paragraphs[0] ?? heroNarration,
    walkthrough: paragraphs[1] ?? walkthroughNarration,
    outro: paragraphs[2] ?? outroNarration,
  };

  // Update scenes in video-daily.json
  for (const scene of data.scenes) {
    if (sceneNarrations[scene.id]) {
      scene.narration = sceneNarrations[scene.id];
    }
  }

  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  console.log(`\nUpdated narration in ${DATA_PATH}`);

  // Also write standalone script for TTS input
  const scriptPath = resolve(process.cwd(), "data/video-script.txt");
  const fullScript = data.scenes.map((s) => s.narration).join("\n\n");
  writeFileSync(scriptPath, fullScript);
  console.log(`Wrote ${scriptPath} (${fullScript.split(/\s+/).length} words)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
