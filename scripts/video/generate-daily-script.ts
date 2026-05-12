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

// ~150 wpm natural speech → 5s ≈ 12 words. Condense to fit without speed-racing TTS.
function trimNarration(text: string, holdSec: number): string {
  const maxWords = Math.floor(holdSec * 2.5);
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  // Try splitting on sentence boundaries first — keep complete sentences that fit
  const sentences = text.split(/(?<=[.!?])\s+/);
  let result = "";
  for (const s of sentences) {
    const candidate = result ? `${result} ${s}` : s;
    if (candidate.split(/\s+/).length <= maxWords) {
      result = candidate;
    } else break;
  }
  if (result && result.split(/\s+/).length >= 4) {
    return result.endsWith(".") || result.endsWith("!") || result.endsWith("?") ? result : `${result}.`;
  }

  // Fallback: cut at a clause boundary (comma, dash, semicolon)
  let trimmed = words.slice(0, maxWords).join(" ");
  const clauseEnd = Math.max(trimmed.lastIndexOf(","), trimmed.lastIndexOf(" —"), trimmed.lastIndexOf(" -"), trimmed.lastIndexOf(";"));
  if (clauseEnd > trimmed.length * 0.4) {
    trimmed = trimmed.slice(0, clauseEnd);
  }
  trimmed = trimmed.replace(/\s+(and|but|or|the|a|an|in|on|at|for|of|with|from|to|is|was|that|this)$/i, "");
  if (!trimmed.endsWith(".") && !trimmed.endsWith("!") && !trimmed.endsWith("?")) trimmed += ".";
  return trimmed;
}

// Distil verbose headlines (Reddit/HN style) into broadcast-friendly sentences
function distilHeadline(headline: string): string {
  let h = headline;
  // Strip personal framing ("I built...", "I catalogued...", "Is anyone...")
  h = h.replace(/^I('ve)?\s+(built|made|created|catalogued|wrote|found|discovered|vibed)\s+(up\s+)?/i, (_, _ve, verb) => {
    const past: Record<string, string> = {
      built: "New tool:", made: "New tool:", created: "New tool:", vibed: "Recreation:",
      catalogued: "Study:", wrote: "New:", found: "Finding:", discovered: "Discovery:",
    };
    return past[verb.toLowerCase()] + " ";
  });
  h = h.replace(/^Is\s+Anyone\s+/i, "Community asks: ");
  // Strip trailing commentary after comma/dash ("here's what I found", "it's been fun")
  h = h.replace(/[,\s]+here'?s?\s+what.*$/i, ".");
  h = h.replace(/[,\s]+and\s+(?:here|it).*$/i, ".");
  // Strip personal relative clauses
  h = h.replace(/\s+I\s+used\s+to\s+.*$/i, ".");
  h = h.replace(/\s+\d+\s+years?\s+ago$/i, ".");
  if (!h.endsWith(".") && !h.endsWith("!") && !h.endsWith("?")) h += ".";
  return h;
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
    narration: { id: "top-model", narration: trimNarration(narrationText, 10) },
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
        holdSec: 5,
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
        narration: trimNarration(
          direction === "up"
            ? `${name} climbed ${delta} ranks — from ${ordinal(m.previousRank)} to ${ordinal(m.rank)}.${price ? ` At ${price} per million tokens.` : ""}`
            : `${name} dropped ${delta} ranks. Now ${ordinal(m.rank)}, was ${ordinal(m.previousRank)}.${price ? ` At ${price} per million.` : ""}`,
          5,
        ),
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
        holdSec: 5,
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
        narration: trimNarration(`${narrative.headline.split(" downloads")[0]} downloads ${direction} ${absPct.toFixed(0)} percent this week.`, 5),
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
        holdSec: 5,
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
        narration: trimNarration(`${narrative.headline.split(" trending")[0]} is trending on GitHub. ${m.stars} stars today.`, 5),
      },
    };
  }

  // Parse rank changes from headline text (wire events often have "down N ranks" without metrics)
  const rankMatch = narrative.headline.match(/\b(up|down)\s+(\d+)\s+ranks?\b/i);
  if (rankMatch) {
    const direction = rankMatch[1].toLowerCase() as "up" | "down";
    const delta = parseInt(rankMatch[2], 10);
    const name = narrative.headline.split(":")[0].trim() || narrative.headline.split(" ")[0];
    return {
      story: {
        id: narrative.id,
        segment: "story",
        headline: narrative.headline,
        type: "data-card",
        scene: "models",
        holdSec: 5,
        dataCard: {
          label: direction === "up" ? "RANK UP" : "RANK DOWN",
          number: `${direction === "up" ? "↑" : "↓"} ${delta}`,
          direction,
          title: name,
          source: `Source: OpenRouter · ${DATE}`,
        },
      },
      narration: {
        id: narrative.id,
        narration: trimNarration(`${name} dropped ${delta} ranks on OpenRouter this week.`, 5),
      },
    };
  }

  // High-engagement community posts — show as data card with engagement metric
  if ((m.points ?? 0) >= 100) {
    const shortHeadline = distilHeadline(narrative.headline);
    return {
      story: {
        id: narrative.id,
        segment: "story",
        headline: narrative.headline,
        type: "data-card",
        scene: "wire",
        holdSec: 5,
        dataCard: {
          label: "TRENDING",
          number: `▲ ${m.points}`,
          direction: "up" as const,
          title: shortHeadline.replace(/\.$/, ""),
          source: `Source: Reddit · ${DATE}`,
        },
      },
      narration: {
        id: narrative.id,
        narration: trimNarration(shortHeadline, 5),
      },
    };
  }

  // Fallback: data card with headline (no lower-thirds — every story gets full-screen treatment)
  const shortHeadline = distilHeadline(narrative.headline);
  return {
    story: {
      id: narrative.id,
      segment: "story",
      headline: narrative.headline,
      type: "data-card",
      scene: "wire",
      holdSec: 5,
      dataCard: {
        label: "IN FOCUS",
        number: "—",
        direction: "neutral" as const,
        title: shortHeadline.replace(/\.$/, ""),
        source: `Source: Community · ${DATE}`,
      },
    },
    narration: {
      id: narrative.id,
      narration: trimNarration(shortHeadline, 5),
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

  // Remaining stories — only include events with verifiable metrics
  const maxStories = 9;
  let storyCount = 0;

  for (const narrative of narratives) {
    if (storyCount >= maxStories) break;
    const event = narrative.events[0];
    if (!event) continue;

    const m = event.metrics ?? {};
    const hasHardMetric = m.rank !== undefined || m.deltaPct !== undefined || m.stars !== undefined;
    const hasHighEngagement = (m.points ?? 0) >= 100 || (m.comments ?? 0) >= 50;
    // Wire headlines with rank info ("down N ranks") have verifiable data even if metrics are empty
    const hasRankInHeadline = /\b(up|down)\s+\d+\s+ranks?\b/i.test(narrative.headline);
    if (!hasHardMetric && !hasHighEngagement && !hasRankInHeadline) {
      console.log(`  [SKIP     ] No verifiable metric — ${narrative.headline.slice(0, 50)}`);
      continue;
    }

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

  // Supplement with data from video-daily.json if we haven't hit 9 stories
  const VIDEO_DAILY = resolve(ROOT, "data/video-daily.json");
  if (storyCount < maxStories && existsSync(VIDEO_DAILY)) {
    const vd = JSON.parse(readFileSync(VIDEO_DAILY, "utf-8"));
    const usedHeadlines = new Set(stories.map(s => s.headline.toLowerCase()));

    // SDK movers with significant changes
    for (const sdk of vd.sdkMovers ?? []) {
      if (storyCount >= maxStories) break;
      if (Math.abs(sdk.diffPct) < 5 || Math.abs(sdk.diffPct) > 500) continue;
      const direction = sdk.diffPct > 0 ? "up" : "down";
      const id = `sdk-${sdk.name}`;
      const headline = `${sdk.name} (${sdk.registry}) ${direction} ${Math.abs(sdk.diffPct).toFixed(0)}%`;
      if (usedHeadlines.has(headline.toLowerCase())) continue;
      stories.push({
        id, segment: "story", headline, type: "data-card", scene: "sdk-adoption", holdSec: 5,
        dataCard: {
          label: "SDK ADOPTION",
          number: `${direction === "up" ? "↑" : "↓"} ${Math.abs(sdk.diffPct).toFixed(0)}%`,
          direction,
          title: `${sdk.name} · ${sdk.registry}`,
          source: `Source: Package registry · ${DATE}`,
        },
      });
      narrations.push({
        id,
        narration: trimNarration(`${sdk.name} on ${sdk.registry}: downloads ${direction} ${Math.abs(sdk.diffPct).toFixed(0)} percent.`, 5),
      });
      usedHeadlines.add(headline.toLowerCase());
      storyCount++;
      console.log(`  [STORY    ] DATA CARD: ${direction === "up" ? "↑" : "↓"} ${Math.abs(sdk.diffPct).toFixed(0)}% — ${sdk.name} (${sdk.registry})`);
    }

    // Additional model movers not already covered
    for (const model of vd.topModels ?? []) {
      if (storyCount >= maxStories) break;
      const delta = (model.previousRank ?? model.rank) - model.rank;
      if (Math.abs(delta) < 2) continue;
      const nameKey = model.shortName.toLowerCase();
      if (usedHeadlines.has(nameKey) || stories.some(s => s.headline.toLowerCase().includes(nameKey))) continue;
      const direction = delta > 0 ? "up" : "down";
      const id = `model-${model.shortName.replace(/\s+/g, "-")}`;
      const headline = `${model.shortName} ${direction} ${Math.abs(delta)} ranks`;
      stories.push({
        id, segment: "story", headline, type: "data-card", scene: "models", holdSec: 5,
        dataCard: {
          label: direction === "up" ? "RANK UP" : "RANK DOWN",
          number: `${direction === "up" ? "↑" : "↓"} ${Math.abs(delta)}`,
          direction,
          title: `${model.shortName} — Now #${model.rank}, was #${model.previousRank}`,
          source: `Source: OpenRouter · ${DATE}`,
        },
      });
      narrations.push({
        id,
        narration: trimNarration(`${model.shortName} moved ${direction} ${Math.abs(delta)} ranks. Now number ${model.rank}.`, 5),
      });
      usedHeadlines.add(model.shortName.toLowerCase());
      storyCount++;
      console.log(`  [STORY    ] DATA CARD: ${direction === "up" ? "↑" : "↓"} ${Math.abs(delta)} — ${model.shortName}`);
    }

    // Top repos — skip; raw event counts aren't insightful without delta context
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
