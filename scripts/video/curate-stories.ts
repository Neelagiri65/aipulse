/**
 * CLI: ingest → score → cluster → rank → narrate top stories.
 *
 * Usage: npx tsx scripts/video/curate-stories.ts [--max 6] [--llm] [--out data/curated.json]
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { ingestAll } from "../../src/lib/curation/ingest";
import { scoreAll } from "../../src/lib/curation/score";
import { buildNarratives } from "../../src/lib/curation/cluster";
import { rotateLeadForFreshness } from "../../src/lib/curation/lead-freshness";
import type { CurationResult, CurationSource, Narrative } from "../../src/lib/curation/types";

/** Previous days' actual video titles, newest first — the ground truth
 *  for what a viewer has already seen leading the channel. Fail-soft:
 *  a missing/corrupt log disables rotation, never blocks curation. */
function readRecentLeadTitles(): string[] {
  const logPath = resolve(process.cwd(), "data/upload-log.json");
  if (!existsSync(logPath)) return [];
  try {
    const log: Array<{ date?: string; title?: string }> = JSON.parse(
      readFileSync(logPath, "utf-8"),
    );
    return log
      .filter((e) => typeof e.title === "string")
      .slice(-5)
      .reverse()
      .map((e) => e.title as string);
  } catch {
    return [];
  }
}

const args = process.argv.slice(2);
function flag(name: string): boolean {
  return args.includes(`--${name}`);
}
function param(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const MAX_NARRATIVES = parseInt(param("max", "6"), 10);
const USE_LLM = flag("llm");
const OUT_PATH = resolve(process.cwd(), param("out", "data/curated.json"));

async function narrateWithLLM(narratives: Narrative[]): Promise<Narrative[]> {
  const apiKey = process.env.NVIDIA_NIM_KEY;
  if (!apiKey) {
    console.warn("  No NVIDIA_NIM_KEY — skipping LLM narration");
    return narratives.map((n) => ({
      ...n,
      editorial: fallbackEditorial(n),
    }));
  }

  const storySummaries = narratives
    .map(
      (n, i) =>
        `${i + 1}. [${n.segment.toUpperCase()}] ${n.headline} (attention: ${n.attention}, ${n.events.length} events)`
    )
    .join("\n");

  const prompt = `You are writing a 90-second AI news broadcast. Given these ranked stories, write a punchy 1–2 sentence editorial for each. Hook-first: lead with the most surprising fact. Use present tense. Keep every number exact. IMPORTANT: output plain text only — no markdown, no formatting. Output one editorial per line, numbered to match.

STORIES:
${storySummaries}

Output ${narratives.length} numbered lines, nothing else.`;

  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-4-maverick-17b-128e-instruct",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.warn(`  LLM call failed (${res.status})`);
      return narratives.map((n) => ({ ...n, editorial: fallbackEditorial(n) }));
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    const lines = text
      .replace(/\*\*/g, "")
      .replace(/[*_#`]/g, "")
      .split("\n")
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter((l) => l.length > 0);

    return narratives.map((n, i) => ({
      ...n,
      editorial: lines[i] ?? fallbackEditorial(n),
    }));
  } catch (e) {
    console.warn("  LLM narration error:", e);
    return narratives.map((n) => ({ ...n, editorial: fallbackEditorial(n) }));
  }
}

function fallbackEditorial(n: Narrative): string {
  const lead = n.events[0];
  if (!lead) return n.headline;
  const extra = n.events.length > 1 ? ` Plus ${n.events.length - 1} related events.` : "";
  return `${lead.title}.${extra}`;
}

async function main() {
  console.log("=== Gawk Curation Pipeline ===\n");

  console.log("1. Ingesting from 9 sources...");
  const raw = await ingestAll();
  console.log(`   Total: ${raw.length} events\n`);

  if (raw.length === 0) {
    console.log("No events ingested. Check network and source availability.");
    process.exit(1);
  }

  console.log("2. Scoring...");
  const scored = scoreAll(raw);
  console.log(`   Top score: ${scored[0]?.attention.total ?? 0}`);
  console.log(`   Bottom score: ${scored[scored.length - 1]?.attention.total ?? 0}\n`);

  console.log("3. Clustering + deduplicating...");
  const clustered = buildNarratives(scored, MAX_NARRATIVES);
  console.log(`   ${clustered.length} narratives from ${scored.length} scored events\n`);

  // Cross-day lead freshness (2026-07-05 incident: the same lead shipped
  // SIX days running — a standing state is not news). Compares against
  // the previous days' actual video titles from the upload log; the
  // repeated story stays in the video, just not as the lead/title.
  console.log("3b. Cross-day lead freshness...");
  const recentLeadTitles = readRecentLeadTitles();
  const rotation = rotateLeadForFreshness(clustered, recentLeadTitles);
  console.log(`   ${rotation.reason}\n`);
  const narratives = rotation.narratives;

  let final = narratives;
  if (USE_LLM) {
    console.log("4. Generating editorial narration (LLM)...");
    final = await narrateWithLLM(narratives);
  } else {
    console.log("4. Using template editorials (pass --llm for LLM narration)...");
    final = narratives.map((n) => ({ ...n, editorial: fallbackEditorial(n) }));
  }

  const sourceCounts = {} as Record<CurationSource, number>;
  for (const e of raw) {
    sourceCounts[e.source] = (sourceCounts[e.source] ?? 0) + 1;
  }

  const result: CurationResult = {
    generatedAt: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
    narratives: final,
    totalEventsIngested: raw.length,
    sourceCounts,
    language: "en",
  };

  writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(`\n=== Output ===`);
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`${final.length} narratives, ${raw.length} events ingested\n`);

  for (const n of final) {
    console.log(`[${n.segment.toUpperCase().padEnd(9)}] ${n.headline}`);
    if (n.editorial) console.log(`            ${n.editorial.slice(0, 100)}${n.editorial.length > 100 ? "..." : ""}`);
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
