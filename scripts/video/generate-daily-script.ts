/**
 * Auto-generate script-locked.json + narration-locked.json from fresh curated data.
 *
 * Pulls live model rankings from gawk.dev/api/v1/models to populate
 * leaderboards and data cards. Produces broadcast-ready narration text.
 *
 * Replaces manual script curation for the daily pipeline.
 *
 * Usage:
 *   npx tsx scripts/video/generate-daily-script.ts
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();
const GAWK_BASE = process.env.GAWK_BASE_URL || "https://gawk.dev";
const CURATED = resolve(ROOT, "data/curated.json");
const SCRIPT_OUT = resolve(ROOT, "data/script-locked.json");
const NARRATION_OUT = resolve(ROOT, "data/narration-locked.json");

const DATE = new Date().toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
});

type ModelRow = {
  rank: number;
  previousRank: number;
  shortName: string;
  name: string;
  slug: string;
  pricing: { promptPerMTok: number; completionPerMTok: number };
};

type CurationEvent = {
  id: string;
  source: string;
  title: string;
  summary: string;
  metrics: Record<string, any>;
  tags: string[];
};

type Narrative = {
  id: string;
  segment: string;
  headline: string;
  events: CurationEvent[];
  attention: number;
};

type LockedStory = {
  id: string;
  segment: string;
  headline: string;
  type: "leaderboard" | "data-card" | "lower-third";
  scene: string;
  holdSec: number;
  leaderboard?: any;
  dataCard?: any;
};

type NarrationEntry = { id: string; narration: string };

function formatTokens(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function formatPrice(p: number): string {
  if (p < 0.01) return `$${p.toFixed(3)}`;
  if (p < 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(2)}`;
}

function numberToWords(n: number): string {
  const words: Record<number, string> = {
    1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
    6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
  };
  return words[n] || String(n);
}

function ordinal(n: number): string {
  const s = String(n);
  if (s.endsWith("1") && n !== 11) return `${n}st`;
  if (s.endsWith("2") && n !== 12) return `${n}nd`;
  if (s.endsWith("3") && n !== 13) return `${n}rd`;
  return `${n}th`;
}

async function fetchModels(): Promise<ModelRow[]> {
  try {
    const res = await fetch(`${GAWK_BASE}/api/v1/models`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.rows ?? [];
  } catch {
    return [];
  }
}

function buildLeaderboardStory(models: ModelRow[]): { story: LockedStory; narration: NarrationEntry } | null {
  if (models.length < 5) return null;

  const top = models[0];
  const biggestMover = models.slice(0, 15).reduce((best, m) => {
    const delta = m.previousRank - m.rank;
    return delta > (best.previousRank - best.rank) ? m : best;
  }, models[0]);

  const rows = models.slice(0, 5).map((m) => ({
    rank: m.rank,
    name: m.shortName,
    value: formatPrice(m.pricing.promptPerMTok) + "/MTok",
  }));

  const topChanged = top.previousRank !== top.rank;
  const heroSub = topChanged
    ? `#1 — up from #${top.previousRank}`
    : `#1 — holds position`;

  const headline = topChanged
    ? `${top.shortName} takes #1 on OpenRouter`
    : `${top.shortName} holds #1 on OpenRouter`;

  const runner = models[1];
  const narrationText = topChanged
    ? `${top.shortName} just took number one on OpenRouter. ${formatPrice(top.pricing.promptPerMTok)} per million tokens. ${runner.shortName} drops to second.`
    : `${top.shortName} holds number one on OpenRouter. ${formatPrice(top.pricing.promptPerMTok)} per million tokens. ${runner.shortName} in second at ${formatPrice(runner.pricing.promptPerMTok)}.`;

  return {
    story: {
      id: "top-model",
      segment: "hook",
      headline,
      type: "leaderboard",
      scene: "globe",
      holdSec: 10,
      leaderboard: {
        label: `OPENROUTER RANKING · ${DATE.toUpperCase()}`,
        heroName: top.shortName.toUpperCase(),
        heroSub,
        rows,
        source: `Source: OpenRouter Top Weekly · ${DATE}`,
      },
    },
    narration: { id: "top-model", narration: narrationText },
  };
}

function buildMoverStory(event: CurationEvent, narrative: Narrative, models: ModelRow[]): { story: LockedStory; narration: NarrationEntry } {
  const m = event.metrics;

  if (m.rank !== undefined && m.previousRank !== undefined) {
    const delta = Math.abs(m.previousRank - m.rank);
    const direction = m.previousRank > m.rank ? "up" : "down";
    const model = models.find((r) => narrative.headline.toLowerCase().includes(r.shortName.toLowerCase()));
    const name = model?.shortName || narrative.headline.split(" ")[0];
    const price = model ? formatPrice(model.pricing.promptPerMTok) : "";

    return {
      story: {
        id: narrative.id,
        segment: "story",
        headline: narrative.headline,
        type: "data-card",
        scene: "models",
        holdSec: 7,
        dataCard: {
          label: direction === "up" ? "RANK UP" : "RANK DOWN",
          number: `${direction === "up" ? "↑" : "↓"} ${delta}`,
          direction,
          title: `${name} — Now #${m.rank}, was #${m.previousRank}`,
          source: `Source: OpenRouter Weekly · ${DATE}`,
        },
      },
      narration: {
        id: narrative.id,
        narration: direction === "up"
          ? `${name} climbed ${delta} ranks — from ${ordinal(m.previousRank)} to ${ordinal(m.rank)}.${price ? ` At ${price} per million tokens.` : ""}`
          : `${name} dropped ${delta} ranks. Now ${ordinal(m.rank)}, was ${ordinal(m.previousRank)}.${price ? ` At ${price} per million.` : ""}`,
      },
    };
  }

  if (m.deltaPct !== undefined) {
    const absPct = Math.abs(m.deltaPct);
    const direction = m.deltaPct > 0 ? "up" : "down";
    const label = event.tags?.includes("sdk") ? "DOWNLOADS" : "CHANGE";

    return {
      story: {
        id: narrative.id,
        segment: "story",
        headline: narrative.headline,
        type: "data-card",
        scene: "sdk-adoption",
        holdSec: 7,
        dataCard: {
          label,
          number: `${direction === "up" ? "↑" : "↓"} ${absPct.toFixed(0)}%`,
          direction,
          title: narrative.headline,
          source: `Source: Package registry data · ${DATE}`,
        },
      },
      narration: {
        id: narrative.id,
        narration: `${narrative.headline.split(" downloads")[0]} downloads ${direction} ${absPct.toFixed(0)} percent this week.`,
      },
    };
  }

  if (m.stars !== undefined) {
    return {
      story: {
        id: narrative.id,
        segment: "story",
        headline: narrative.headline,
        type: "data-card",
        scene: "wire",
        holdSec: 7,
        dataCard: {
          label: "TRENDING",
          number: `★ ${m.stars}`,
          direction: "up",
          title: narrative.headline,
          source: `Source: GitHub Trending · ${DATE}`,
        },
      },
      narration: {
        id: narrative.id,
        narration: `${narrative.headline.split(" trending")[0]} is trending on GitHub. ${m.stars} stars today.`,
      },
    };
  }

  // Fallback: lower-third for text-only stories
  return {
    story: {
      id: narrative.id,
      segment: "story",
      headline: narrative.headline,
      type: "lower-third",
      scene: "wire",
      holdSec: 7,
    },
    narration: {
      id: narrative.id,
      narration: narrative.headline.endsWith(".") ? narrative.headline : `${narrative.headline}.`,
    },
  };
}

async function main() {
  if (!existsSync(CURATED)) {
    console.error("Missing data/curated.json — run curate-stories.ts first");
    process.exit(1);
  }

  const curated = JSON.parse(readFileSync(CURATED, "utf-8"));
  const narratives: Narrative[] = curated.narratives ?? [];

  if (narratives.length === 0) {
    console.error("No narratives in curated.json");
    process.exit(1);
  }

  console.log(`Generating daily script from ${narratives.length} curated narratives...\n`);

  const models = await fetchModels();
  console.log(`Fetched ${models.length} models from gawk.dev\n`);

  const stories: LockedStory[] = [];
  const narrations: NarrationEntry[] = [];

  // Intro narration
  narrations.push({ id: "intro", narration: `${DATE}. Here's what moved.` });

  // Hook: always a leaderboard from live model data
  const leaderboard = buildLeaderboardStory(models);
  if (leaderboard) {
    stories.push(leaderboard.story);
    narrations.push(leaderboard.narration);
    console.log(`  [HOOK     ] LEADERBOARD: ${leaderboard.story.headline}`);
  }

  // Remaining stories from curated narratives
  const maxStories = 3;
  let storyCount = 0;

  for (const narrative of narratives) {
    if (storyCount >= maxStories) break;
    const event = narrative.events[0];
    if (!event) continue;

    // Skip if it duplicates the leaderboard hook
    if (leaderboard && narrative.headline.toLowerCase().includes(models[0]?.shortName?.toLowerCase() || "___")) {
      continue;
    }

    const { story, narration } = buildMoverStory(event, narrative, models);
    stories.push(story);
    narrations.push(narration);
    storyCount++;

    const typeLabel = story.type === "data-card" ? `DATA CARD: ${story.dataCard?.number}` : story.type.toUpperCase();
    console.log(`  [${story.segment.toUpperCase().padEnd(9)}] ${typeLabel} — ${story.headline.slice(0, 50)}`);
  }

  // Outro narration
  narrations.push({
    id: "outro",
    narration: "That's the briefing. Every number links to its source. gawk dot dev.",
  });

  // Write outputs
  writeFileSync(SCRIPT_OUT, JSON.stringify(stories, null, 2));
  writeFileSync(NARRATION_OUT, JSON.stringify(narrations, null, 2));

  console.log(`\nWrote ${stories.length} stories to data/script-locked.json`);
  console.log(`Wrote ${narrations.length} narration entries to data/narration-locked.json`);
  console.log(`\nStories: ${stories.map((s) => s.type).join(", ")}`);
  console.log(`Duration: ~${stories.reduce((a, s) => a + s.holdSec, 0) + 5}s (+ intro/outro/wipes)`);
}

main().catch((e) => {
  console.error("Script generation failed:", e.message || e);
  process.exit(1);
});
