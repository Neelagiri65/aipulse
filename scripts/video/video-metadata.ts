/**
 * Shared metadata builder for multi-platform video distribution.
 * Generates platform-specific captions, hashtags, and titles from the video manifest.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();

type Story = { id: string; headline: string; startSec: number; holdSec?: number };

function loadStories(format: string = "youtube"): Story[] {
  const manifestPath = resolve(ROOT, `data/video-manifest-${format}.json`);
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  return manifest.filter(
    (e: any) => e.segment !== "map" && e.segment !== "wipe" && e.segment !== "outro" && e.id !== "intro"
  );
}

function dateFormatted(): string {
  return new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const HASHTAGS = {
  core: ["#AI", "#AITools", "#DeveloperTools", "#OpenRouter", "#GawkDaily"],
  instagram: ["#AINews", "#TechNews", "#MachineLearning", "#AIInfrastructure", "#Reels", "#TechReels"],
  tiktok: ["#AINews", "#TechTok", "#LearnOnTikTok", "#MachineLearning", "#AITools"],
  facebook: ["#AI", "#ArtificialIntelligence", "#TechNews", "#AIInfrastructure"],
};

export type PlatformMetadata = {
  title: string;
  caption: string;
  hashtags: string[];
  stories: Story[];
};

export function buildMetadata(platform: "youtube" | "instagram" | "facebook" | "tiktok", format?: string): PlatformMetadata {
  const fmt = format ?? (platform === "instagram" || platform === "tiktok" ? "instagram" : "youtube");
  const stories = loadStories(fmt);
  const lead = stories[0]?.headline || "AI Infrastructure Daily Brief";
  const date = dateFormatted();
  const storyCount = stories.length;
  const duration = Math.round(stories.reduce((a, s) => a + (s.holdSec || 7), 0));

  const platformHashtags = [...HASHTAGS.core, ...(HASHTAGS[platform] ?? [])];

  switch (platform) {
    case "youtube":
      return {
        title: `${lead.slice(0, 60)} | Gawk Daily — ${date}`,
        caption: buildYouTubeDescription(stories, storyCount, duration),
        hashtags: HASHTAGS.core,
        stories,
      };

    case "instagram":
      return {
        title: lead.slice(0, 60),
        caption: [
          `${lead}`,
          "",
          `${storyCount} stories. ${duration}s. Every number verified.`,
          "",
          stories.map((s) => `→ ${s.headline}`).join("\n"),
          "",
          "Data dashboard: gawk.dev",
          "Subscribe: gawk.dev/subscribe",
          "",
          platformHashtags.join(" "),
        ].join("\n"),
        hashtags: platformHashtags,
        stories,
      };

    case "tiktok":
      return {
        title: lead.slice(0, 60),
        caption: [
          `${lead}`,
          "",
          `${storyCount} AI stories in ${duration}s. Every number verified.`,
          "",
          "Dashboard: gawk.dev",
          "",
          platformHashtags.join(" "),
        ].join("\n"),
        hashtags: platformHashtags,
        stories,
      };

    case "facebook":
      return {
        title: `${lead} | Gawk Daily — ${date}`,
        caption: [
          `${lead}`,
          "",
          `${storyCount} stories. ${duration} seconds. Every number verified.`,
          "",
          stories.map((s) => `• ${s.headline}`).join("\n"),
          "",
          "Every number on screen traces to a public source.",
          "Data dashboard: https://gawk.dev",
          "Subscribe for daily briefs: https://gawk.dev/subscribe",
          "",
          platformHashtags.join(" "),
        ].join("\n"),
        hashtags: platformHashtags,
        stories,
      };
  }
}

function buildYouTubeDescription(stories: Story[], count: number, duration: number): string {
  const timestamps = stories
    .map((s) => {
      const mm = String(Math.floor(s.startSec / 60)).padStart(2, "0");
      const ss = String(Math.floor(s.startSec % 60)).padStart(2, "0");
      return `${mm}:${ss} ${s.headline}`;
    })
    .join("\n");

  return [
    `${count} stories. ${duration} seconds. Every number verified.`,
    "",
    timestamps,
    "",
    "Sources: OpenRouter /rankings, OpenRouter top-weekly via gawk.dev API",
    "",
    "Every number on screen traces to a public source.",
    "Data dashboard: https://gawk.dev",
    "Subscribe for daily briefs: https://gawk.dev/subscribe",
    "",
    "#AI #OpenRouter #AITools #DeveloperTools",
  ].join("\n");
}
