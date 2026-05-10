/**
 * Fetches all data needed for the 10-scene daily video.
 * Hits /api/v1/* endpoints on gawk.dev, writes data/video-daily.json.
 *
 * Usage: npx tsx scripts/video/fetch-video-data.ts
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import type { VideoData } from "../../src/video/types";

const BASE_URL = process.env.GAWK_BASE_URL || "https://gawk.dev";
const HN_MIN_POINTS = 50;
const HN_MIN_COMMENTS = 10;

async function fetchJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function main() {
  const [feedRes, modelsRes, hnRes, regionRes, labsRes, agentsRes, sdkRes, statusRes] =
    await Promise.all([
      fetchJSON<{
        cards: {
          headline: string;
          detail?: string;
          type: string;
          sourceName: string;
          meta: Record<string, string | number | boolean>;
        }[];
        currentState?: {
          toolHealth: { operational: number; degraded: number; total: number };
        };
        inferences?: string[];
      }>("/api/v1/feed"),
      fetchJSON<{
        rows: {
          rank: number;
          name: string;
          slug: string;
          previousRank: number | null;
        }[];
        fetchedAt?: string;
      }>("/api/v1/models?limit=5"),
      fetchJSON<{
        items: {
          title: string;
          points: number;
          numComments?: number;
          url?: string;
        }[];
      }>("/api/hn"),
      fetchJSON<{
        topGrowingCountry: { country: string; deltaPct: number } | null;
        mostActiveCity: { city: string; count: number } | null;
      }>("/api/globe-events/regional-deltas"),
      fetchJSON<{
        labs: {
          displayName: string;
          total: number;
          repos: { owner: string; repo: string; total: number }[];
        }[];
      }>("/api/v1/labs"),
      fetchJSON<{
        rows: { name: string; weeklyDownloads: number }[];
      }>("/api/v1/agents"),
      fetchJSON<{
        packages: {
          id: string;
          label: string;
          registry: string;
          days: { date: string; count: number | null; delta: number | null }[];
        }[];
      }>("/api/v1/sdk"),
      fetchJSON<{
        data: Record<string, { status: string }>;
      }>("/api/v1/status"),
    ]);

  // --- Feed cards ---
  const topCards = (feedRes?.cards ?? []).slice(0, 5).map((c) => ({
    headline: c.headline,
    detail: c.detail,
    type: c.type,
    sourceName: c.sourceName,
  }));

  // --- Models (real deltas) ---
  const topModels = (modelsRes?.rows ?? []).slice(0, 5).map((m) => ({
    rank: m.rank,
    name: m.name,
    previousRank: m.previousRank,
    isOpenWeight: false,
  }));

  // --- Tool health ---
  const statusData = statusRes?.data ?? {};
  const tools = Object.entries(statusData).map(([name, val]) => ({
    name: name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    status: val.status,
  }));
  const toolHealth = {
    operational: feedRes?.currentState?.toolHealth?.operational ?? tools.filter((t) => t.status === "operational").length,
    degraded: feedRes?.currentState?.toolHealth?.degraded ?? tools.filter((t) => t.status !== "operational").length,
    total: feedRes?.currentState?.toolHealth?.total ?? tools.length,
    tools,
  };

  // --- HN (threshold: ≥50pts + ≥10 comments) ---
  const qualifyingHn = (hnRes?.items ?? [])
    .filter((i) => i.points >= HN_MIN_POINTS && (i.numComments ?? 0) >= HN_MIN_COMMENTS)
    .sort((a, b) => b.points - a.points);
  const hnTopStory = qualifyingHn[0]
    ? { title: qualifyingHn[0].title, points: qualifyingHn[0].points, url: qualifyingHn[0].url ?? "" }
    : null;

  // --- Region ---
  const topRegion = regionRes?.topGrowingCountry ?? null;
  const mostActiveCity = regionRes?.mostActiveCity ?? null;

  // --- Labs (top 3 by event count) ---
  const allLabs = (labsRes?.labs ?? [])
    .map((l) => ({
      name: l.displayName,
      eventCount: l.total,
      repoCount: l.repos?.length ?? 0,
    }))
    .sort((a, b) => b.eventCount - a.eventCount);
  const topLabs = allLabs.slice(0, 3);

  // --- Agents (top 3 by weekly downloads) ---
  const topAgents = (agentsRes?.rows ?? [])
    .sort((a, b) => b.weeklyDownloads - a.weeklyDownloads)
    .slice(0, 3)
    .map((a) => ({ name: a.name, weeklyDownloads: a.weeklyDownloads }));

  // --- SDK movers (biggest absolute diffPct in last available day) ---
  const sdkMovers = deriveSdkMovers(sdkRes?.packages ?? []);

  // --- Top repos (from labs data — repos with highest event counts) ---
  const topRepos = deriveTopRepos(labsRes?.labs ?? []);

  // --- Ecosystem stats ---
  const ecosystemStats = {
    sources: 40,
    crons: 22,
    labs: allLabs.length || 38,
  };

  const inferences = feedRes?.inferences ?? [];
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const scenes = buildScenes({
    topCards, topModels, toolHealth, topRegion, mostActiveCity,
    hnTopStory, inferences, dateStr, sdkMovers, topAgents, topLabs, topRepos,
  });

  const data: VideoData = {
    generatedAt: now.toISOString(),
    date: dateStr,
    scenes,
    topCards,
    topModels,
    toolHealth,
    topRegion,
    mostActiveCity,
    hnTopStory,
    inferences,
    ecosystemStats,
    modelsFetchedAt: modelsRes?.fetchedAt ?? null,
    sdkMovers,
    topAgents,
    topLabs,
    topRepos,
    screenshots: { map: "map-global.png", mapZoom: "map-zoom.png" },
  };

  const outPath = resolve(process.cwd(), "data/video-daily.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(
    `Wrote ${outPath} (${scenes.length} scenes, ${topCards.length} cards, ${topModels.length} models, ` +
    `${topLabs.length} labs, ${topAgents.length} agents, ${sdkMovers.length} SDK movers, ${topRepos.length} repos)`
  );
}

function deriveSdkMovers(
  packages: { id: string; label: string; registry: string; days: { date: string; count: number | null; delta: number | null }[] }[]
): VideoData["sdkMovers"] {
  const withDelta: { name: string; registry: string; diffPct: number }[] = [];
  for (const pkg of packages) {
    const recentDays = pkg.days.filter((d) => d.delta !== null).slice(-3);
    if (recentDays.length === 0) continue;
    const avgDelta = recentDays.reduce((s, d) => s + (d.delta ?? 0), 0) / recentDays.length;
    withDelta.push({ name: pkg.label, registry: pkg.registry, diffPct: Math.round(avgDelta * 1000) / 10 });
  }
  withDelta.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));
  return withDelta.slice(0, 3);
}

function deriveTopRepos(
  labs: { displayName: string; repos: { owner: string; repo: string; total: number }[] }[]
): VideoData["topRepos"] {
  const allRepos: VideoData["topRepos"] = [];
  for (const lab of labs) {
    for (const r of lab.repos ?? []) {
      allRepos.push({
        name: r.repo,
        owner: r.owner,
        stars: 0,
        eventCount: r.total,
        language: "",
      });
    }
  }
  allRepos.sort((a, b) => b.eventCount - a.eventCount);
  return allRepos.slice(0, 3);
}

function buildScenes(d: {
  topCards: VideoData["topCards"];
  topModels: VideoData["topModels"];
  toolHealth: VideoData["toolHealth"];
  topRegion: VideoData["topRegion"];
  mostActiveCity: VideoData["mostActiveCity"];
  hnTopStory: VideoData["hnTopStory"];
  inferences: string[];
  dateStr: string;
  sdkMovers: VideoData["sdkMovers"];
  topAgents: VideoData["topAgents"];
  topLabs: VideoData["topLabs"];
  topRepos: VideoData["topRepos"];
}): VideoData["scenes"] {
  const scenes: VideoData["scenes"] = [];

  // Scene 1: Title
  scenes.push({
    id: "hero",
    durationInSeconds: 8,
    narration: `Here's what moved in the AI ecosystem on ${formatDate(d.dateStr)}.`,
  });

  // Scene 2: Map / Region
  if (d.topRegion) {
    scenes.push({
      id: "region",
      durationInSeconds: 10,
      narration: `${d.topRegion.country} led activity, up ${Math.round(d.topRegion.deltaPct)}% in the last 24 hours.${d.mostActiveCity ? ` Most active: ${d.mostActiveCity.city} with ${d.mostActiveCity.count} events.` : ""}`,
    });
  }

  // Scene 3: Tool Health
  const degradedTools = d.toolHealth.tools.filter((t) => t.status !== "operational");
  scenes.push({
    id: "tools",
    durationInSeconds: 10,
    narration: degradedTools.length > 0
      ? `${d.toolHealth.operational} of ${d.toolHealth.total} tools operational. ${degradedTools.map((t) => `${t.name} reporting ${t.status}`).join(". ")}.`
      : `All ${d.toolHealth.total} AI coding tools fully operational.`,
  });

  // Scene 4: Model Rankings
  if (d.topModels.length > 0) {
    const top = d.topModels[0];
    scenes.push({
      id: "models",
      durationInSeconds: 10,
      narration: `${top.name} holds number 1 by developer spend on OpenRouter.`,
    });
  }

  // Scene 5: SDK Adoption
  if (d.sdkMovers.length > 0) {
    const narParts = d.sdkMovers.map((s) => {
      const dir = s.diffPct > 0 ? "up" : "down";
      return `${s.name} ${dir} ${Math.abs(s.diffPct)}%`;
    });
    scenes.push({
      id: "sdk",
      durationInSeconds: 10,
      narration: `SDK adoption movers. ${narParts.join(". ")}.`,
    });
  }

  // Scene 6: Agent Frameworks
  if (d.topAgents.length > 0) {
    const top = d.topAgents[0];
    scenes.push({
      id: "agents",
      durationInSeconds: 7,
      narration: `${top.name} leads agent adoption at ${formatNumber(top.weeklyDownloads)} weekly downloads.`,
    });
  }

  // Scene 7: Lab Activity
  if (d.topLabs.length > 0) {
    const narParts = d.topLabs.map((l) => `${l.name} with ${l.eventCount} events`);
    scenes.push({
      id: "labs",
      durationInSeconds: 8,
      narration: `Top lab activity. ${narParts.join(". ")}.`,
    });
  }

  // Scene 8: Top Repos
  if (d.topRepos.length > 0) {
    const narParts = d.topRepos.map((r) => `${r.owner}/${r.name}, ${r.eventCount} events`);
    scenes.push({
      id: "repos",
      durationInSeconds: 10,
      narration: `Top GitHub repos today. ${narParts.join(". ")}.`,
    });
  }

  // Scene 9: HN
  if (d.hnTopStory) {
    scenes.push({
      id: "hn",
      durationInSeconds: 8,
      narration: `Top on Hacker News: ${d.hnTopStory.title}. ${d.hnTopStory.points} points.`,
    });
  }

  // Scene 10: Outro
  scenes.push({
    id: "outro",
    durationInSeconds: 9,
    narration: "Track it live at gawk dot dev. Subscribe for the daily digest.",
  });

  return scenes;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

main().catch((e) => { console.error(e); process.exit(1); });
