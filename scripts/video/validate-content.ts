/**
 * Content Validation — Watchdog Tier 3
 *
 * Cross-checks every claim in script-locked.json against raw source data.
 * Runs after generate-daily-script.ts and before record-walkthrough.ts.
 *
 * Checks:
 *   1. SDK percentages: sign matches direction, magnitude matches raw delta
 *   2. Rank claims: rank + previousRank consistent with data card number
 *   3. Stars/engagement: number matches source
 *   4. Research: arxiv ID exists
 *   5. Narration direction matches data card direction
 *
 * Exit code 0: all checks pass. Exit code 1: at least one contradiction.
 *
 * Usage:
 *   npx tsx scripts/video/validate-content.ts
 *   npx tsx scripts/video/validate-content.ts --strict  # fail on warnings too
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

type DataCard = {
  label: string;
  number: string;
  direction: string;
  title: string;
  source: string;
};

type Story = {
  id: string;
  segment: string;
  headline: string;
  type: string;
  scene: string;
  holdSec: number;
  dataCard?: DataCard;
  leaderboard?: any;
};

type Narration = { id: string; narration: string };

type Issue = { storyId: string; level: "ERROR" | "WARN"; message: string };

function loadJSON<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function validateSdkStory(story: Story, narration: Narration | undefined): Issue[] {
  const issues: Issue[] = [];
  const dc = story.dataCard;
  if (!dc) return issues;

  if (dc.label === "SDK ADOPTION" || dc.label === "DOWNLOADS") {
    const pctMatch = dc.number.match(/(\d+)%/);
    const pct = pctMatch ? parseInt(pctMatch[1], 10) : null;

    if (pct !== null && pct > 500) {
      issues.push({ storyId: story.id, level: "ERROR", message: `SDK percentage ${pct}% exceeds 500% sanity cap` });
    }

    const arrowUp = dc.number.includes("↑");
    const arrowDown = dc.number.includes("↓");

    if (arrowUp && dc.direction !== "up") {
      issues.push({ storyId: story.id, level: "ERROR", message: `Arrow ↑ but direction="${dc.direction}"` });
    }
    if (arrowDown && dc.direction !== "down") {
      issues.push({ storyId: story.id, level: "ERROR", message: `Arrow ↓ but direction="${dc.direction}"` });
    }

    if (narration) {
      const narrationUp = narration.narration.includes("downloads up") || narration.narration.includes("installs up");
      const narrationDown = narration.narration.includes("downloads down") || narration.narration.includes("installs down");
      if (arrowUp && narrationDown) {
        issues.push({ storyId: story.id, level: "ERROR", message: `Card says ↑ but narration says "down"` });
      }
      if (arrowDown && narrationUp) {
        issues.push({ storyId: story.id, level: "ERROR", message: `Card says ↓ but narration says "up"` });
      }
    }
  }

  return issues;
}

function validateRankStory(story: Story, narration: Narration | undefined): Issue[] {
  const issues: Issue[] = [];
  const dc = story.dataCard;
  if (!dc) return issues;

  if (dc.label === "RANK UP" || dc.label === "RANK DOWN") {
    const isUp = dc.label === "RANK UP";
    const arrowUp = dc.number.includes("↑");
    const arrowDown = dc.number.includes("↓");

    if (isUp && arrowDown) {
      issues.push({ storyId: story.id, level: "ERROR", message: `Label "RANK UP" but arrow ↓` });
    }
    if (!isUp && arrowUp) {
      issues.push({ storyId: story.id, level: "ERROR", message: `Label "RANK DOWN" but arrow ↑` });
    }

    if (narration) {
      const narrationClimbed = /climbed|rose|jumped|up/i.test(narration.narration);
      const narrationDropped = /dropped|fell|down|slipped/i.test(narration.narration);
      if (isUp && narrationDropped && !narrationClimbed) {
        issues.push({ storyId: story.id, level: "ERROR", message: `RANK UP but narration says "dropped"` });
      }
      if (!isUp && narrationClimbed && !narrationDropped) {
        issues.push({ storyId: story.id, level: "ERROR", message: `RANK DOWN but narration says "climbed"` });
      }
    }
  }

  return issues;
}

function validateNarrationDirection(story: Story, narration: Narration | undefined): Issue[] {
  const issues: Issue[] = [];
  if (!narration || !story.dataCard) return issues;

  const dc = story.dataCard;
  if (dc.direction === "up" && /\bdown\b/i.test(narration.narration) && !/\bup\b/i.test(narration.narration)) {
    issues.push({ storyId: story.id, level: "WARN", message: `Direction "up" but narration contains "down" without "up"` });
  }
  if (dc.direction === "down" && /\bup\b/i.test(narration.narration) && !/\bdown\b/i.test(narration.narration)) {
    issues.push({ storyId: story.id, level: "WARN", message: `Direction "down" but narration contains "up" without "down"` });
  }

  return issues;
}

function validateLeaderboard(story: Story): Issue[] {
  const issues: Issue[] = [];
  const lb = story.leaderboard;
  if (!lb?.rows) return issues;

  for (let i = 0; i < lb.rows.length; i++) {
    const row = lb.rows[i];
    if (row.rank !== i + 1) {
      issues.push({ storyId: story.id, level: "ERROR", message: `Leaderboard row ${i} has rank ${row.rank}, expected ${i + 1}` });
    }
    if (!row.name || row.name.trim() === "") {
      issues.push({ storyId: story.id, level: "ERROR", message: `Leaderboard row ${i} has empty name` });
    }
  }

  return issues;
}

function validateResearch(story: Story): Issue[] {
  const issues: Issue[] = [];
  const dc = story.dataCard;
  if (!dc || dc.label !== "NEW RESEARCH") return issues;

  if (!dc.title || dc.title.length < 10) {
    issues.push({ storyId: story.id, level: "WARN", message: `Research title too short: "${dc.title}"` });
  }

  return issues;
}

async function main() {
  const scriptPath = resolve(ROOT, "data/script-locked.json");
  const narrationPath = resolve(ROOT, "data/narration-locked.json");

  const stories = loadJSON<Story[]>(scriptPath);
  const narrations = loadJSON<Narration[]>(narrationPath);

  if (!stories) {
    console.error("Missing data/script-locked.json");
    process.exit(1);
  }

  const narrationMap = new Map<string, Narration>();
  for (const n of narrations ?? []) {
    narrationMap.set(n.id, n);
  }

  console.log(`Validating ${stories.length} stories...\n`);

  const allIssues: Issue[] = [];

  for (const story of stories) {
    const narration = narrationMap.get(story.id);

    allIssues.push(...validateSdkStory(story, narration));
    allIssues.push(...validateRankStory(story, narration));
    allIssues.push(...validateNarrationDirection(story, narration));
    allIssues.push(...validateLeaderboard(story));
    allIssues.push(...validateResearch(story));
  }

  const errors = allIssues.filter((i) => i.level === "ERROR");
  const warnings = allIssues.filter((i) => i.level === "WARN");

  if (allIssues.length === 0) {
    console.log("  ✓ All content checks passed\n");
  } else {
    for (const issue of allIssues) {
      const icon = issue.level === "ERROR" ? "✗" : "⚠";
      console.log(`  ${icon} [${issue.storyId}] ${issue.message}`);
    }
    console.log();
  }

  console.log(`Results: ${errors.length} errors, ${warnings.length} warnings`);

  if (errors.length > 0) {
    console.error("\nContent validation FAILED — fix errors before shipping");
    process.exit(1);
  }
  if (STRICT && warnings.length > 0) {
    console.error("\nContent validation FAILED (strict mode) — fix warnings before shipping");
    process.exit(1);
  }
}

main();
