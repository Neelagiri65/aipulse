/**
 * Fetches all data needed for the daily video.
 * Hits /api/v1/* endpoints on gawk.dev, writes data/video-daily.json.
 *
 * Usage: npx tsx scripts/video/fetch-video-data.ts
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import type { VideoData, ModelEntry, PanelCount } from "../../src/video/types";

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
  const [feedRes, modelsRes, hnRes, regionRes, labsRes, agentsRes, sdkRes, statusRes, benchRes, researchRes] =
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
          shortName: string;
          slug: string;
          previousRank: number | null;
          pricing: { promptPerMTok: number | null; completionPerMTok: number | null };
          contextLength: number | null;
        }[];
        fetchedAt?: string;
      }>("/api/v1/models?limit=20"),
      fetchJSON<{
        items: {
          title: string;
          points: number;
          numComments?: number;
          url?: string;
        }[];
      }>("/api/hn"),
      fetchJSON<{
        byCountry: Record<string, { current24h: number; prior24h: number | null; deltaPct: number | null }>;
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
      fetchJSON<{ rows: unknown[] }>("/api/benchmarks"),
      fetchJSON<{ papers: unknown[] }>("/api/research"),
    ]);

  // --- Feed cards ---
  const topCards = (feedRes?.cards ?? []).slice(0, 5).map((c) => ({
    headline: c.headline,
    detail: c.detail,
    type: c.type,
    sourceName: c.sourceName,
  }));

  // --- Models (enhanced with pricing) ---
  const allModels = (modelsRes?.rows ?? []).map((m): ModelEntry => ({
    rank: m.rank,
    name: m.name,
    shortName: m.shortName ?? m.name.split(": ").pop() ?? m.name,
    previousRank: m.previousRank,
    isOpenWeight: false,
    promptPrice: m.pricing?.promptPerMTok ?? null,
    completionPrice: m.pricing?.completionPerMTok ?? null,
    contextLength: m.contextLength ?? null,
  }));
  const topModels = allModels.slice(0, 5);

  // Biggest movers: largest absolute rank delta
  const biggestMovers = allModels
    .filter((m) => m.previousRank !== null)
    .map((m) => ({ ...m, delta: Math.abs((m.previousRank ?? m.rank) - m.rank) }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);

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

  // --- HN ---
  const qualifyingHn = (hnRes?.items ?? [])
    .filter((i) => i.points >= HN_MIN_POINTS && (i.numComments ?? 0) >= HN_MIN_COMMENTS)
    .sort((a, b) => b.points - a.points);
  const hnTopStory = qualifyingHn[0]
    ? { title: qualifyingHn[0].title, points: qualifyingHn[0].points, url: qualifyingHn[0].url ?? "" }
    : null;

  // --- Region ---
  const topRegion = regionRes?.topGrowingCountry ?? null;
  const mostActiveCity = regionRes?.mostActiveCity ?? null;
  const byCountry = regionRes?.byCountry ?? {};

  // --- Labs ---
  const allLabsRaw = labsRes?.labs ?? [];
  const allLabs = allLabsRaw
    .map((l) => ({
      name: l.displayName,
      eventCount: l.total,
      repoCount: l.repos?.length ?? 0,
    }))
    .sort((a, b) => b.eventCount - a.eventCount);
  const topLabs = allLabs.slice(0, 3);

  // --- Agents ---
  const topAgents = (agentsRes?.rows ?? [])
    .sort((a, b) => b.weeklyDownloads - a.weeklyDownloads)
    .slice(0, 3)
    .map((a) => ({ name: a.name, weeklyDownloads: a.weeklyDownloads }));

  // --- SDK movers ---
  const sdkMovers = deriveSdkMovers(sdkRes?.packages ?? []);

  // --- Top repos ---
  const topRepos = deriveTopRepos(allLabsRaw);

  // --- Total events ---
  const totalEvents = Object.values(byCountry).reduce((s, c) => s + (c.current24h ?? 0), 0);
  const activeCountries = Object.keys(byCountry).length;

  // --- Panel counts ---
  const panelCounts: PanelCount[] = [
    { label: "Tools", count: tools.length },
    { label: "Models", count: allModels.length },
    { label: "Agents", count: agentsRes?.rows?.length ?? 0 },
    { label: "Research", count: researchRes?.papers?.length ?? 0 },
    { label: "Benchmarks", count: benchRes?.rows?.length ?? 0 },
    { label: "AI Labs", count: allLabs.length },
    { label: "SDK Adoption", count: sdkRes?.packages?.length ?? 0 },
    { label: "Wire", count: feedRes?.cards?.length ?? 0 },
  ];

  // --- Ecosystem stats ---
  const ecosystemStats = {
    sources: 40,
    crons: 22,
    labs: allLabs.length || 38,
    totalEvents,
    activeCountries,
  };

  const inferences = feedRes?.inferences ?? [];
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  // Walkthrough duration: the Playwright recording covers map + all panels (~80s)
  const WALKTHROUGH_SECONDS = 80;

  const scenes = buildScenes({ dateStr, walkthroughSeconds: WALKTHROUGH_SECONDS });

  const data: VideoData = {
    generatedAt: now.toISOString(),
    date: dateStr,
    scenes,
    topCards,
    topModels,
    biggestMovers,
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
    continents: [],
    panelCounts,
    screenshots: { map: "map-global.png", mapZoom: "map-zoom.png" },
  };

  const outPath = resolve(process.cwd(), "data/video-daily.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  const totalSec = scenes.reduce((s, sc) => s + sc.durationInSeconds, 0);
  console.log(
    `Wrote ${outPath} (${scenes.length} scenes, ${totalSec}s total, ` +
    `${topCards.length} cards, ${topModels.length} models, ${biggestMovers.length} movers)`
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
    if (Math.abs(avgDelta) > 5) continue;
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
      allRepos.push({ name: r.repo, owner: r.owner, stars: 0, eventCount: r.total, language: "" });
    }
  }
  allRepos.sort((a, b) => b.eventCount - a.eventCount);
  return allRepos.slice(0, 3);
}

function buildScenes(d: {
  dateStr: string;
  walkthroughSeconds: number;
}): VideoData["scenes"] {
  const scenes: VideoData["scenes"] = [];

  // [0-5s] Title card
  scenes.push({
    id: "hero",
    durationInSeconds: 5,
    narration: `Here's what moved in the AI ecosystem on ${formatDate(d.dateStr)}.`,
  });

  // [5-85s] Full site walkthrough (Playwright recording: map + panels)
  scenes.push({
    id: "walkthrough",
    durationInSeconds: d.walkthroughSeconds,
    narration: "Live from gawk.dev. Map, tools, models, wire, SDK — all real.",
  });

  // [85-90s] Outro
  scenes.push({
    id: "outro",
    durationInSeconds: 5,
    narration: "Track it live at gawk dot dev.",
  });

  return scenes;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

main().catch((e) => { console.error(e); process.exit(1); });
