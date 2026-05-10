/**
 * Fetches all data needed for the daily video.
 * Hits /api/v1/* endpoints on gawk.dev, writes data/video-daily.json.
 *
 * Usage: npx tsx scripts/video/fetch-video-data.ts
 */

import { writeFileSync, readFileSync } from "fs";
import { resolve } from "path";
import type { VideoData, ContinentData, ModelEntry, PanelCount } from "../../src/video/types";

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

const COUNTRY_TO_CONTINENT: Record<string, string> = {
  "United States": "North America", "Canada": "North America", "Mexico": "North America",
  "Brazil": "South America", "Colombia": "South America", "Argentina": "South America",
  "Chile": "South America", "Peru": "South America", "Uruguay": "South America",
  "Germany": "Europe", "United Kingdom": "Europe", "France": "Europe",
  "Spain": "Europe", "Poland": "Europe", "Austria": "Europe", "Ireland": "Europe",
  "Netherlands": "Europe", "Switzerland": "Europe", "Sweden": "Europe",
  "Norway": "Europe", "Denmark": "Europe", "Finland": "Europe", "Belgium": "Europe",
  "Italy": "Europe", "Portugal": "Europe", "Czech Republic": "Europe", "Czechia": "Europe",
  "Romania": "Europe", "Greece": "Europe", "Hungary": "Europe", "Ukraine": "Europe",
  "Türkiye": "Europe", "Russia": "Europe", "Serbia": "Europe", "Croatia": "Europe",
  "Bulgaria": "Europe", "Slovakia": "Europe", "Lithuania": "Europe", "Latvia": "Europe",
  "Estonia": "Europe", "Slovenia": "Europe",
  "China": "Asia", "Japan": "Asia", "India": "Asia", "South Korea": "Asia",
  "Singapore": "Asia", "Indonesia": "Asia", "Vietnam": "Asia", "Thailand": "Asia",
  "Malaysia": "Asia", "Philippines": "Asia", "Taiwan": "Asia", "Pakistan": "Asia",
  "Bangladesh": "Asia", "Sri Lanka": "Asia", "Hong Kong": "Asia", "Israel": "Asia",
  "United Arab Emirates": "Asia", "Saudi Arabia": "Asia",
  "Australia": "Oceania", "New Zealand": "Oceania",
  "Nigeria": "Africa", "South Africa": "Africa", "Kenya": "Africa", "Egypt": "Africa",
  "Ghana": "Africa", "Ethiopia": "Africa", "Morocco": "Africa", "Tunisia": "Africa",
};

const LAB_COUNTRY_TO_CONTINENT: Record<string, string> = {
  US: "North America", CA: "North America",
  GB: "Europe", DE: "Europe", FR: "Europe", CH: "Europe",
  CN: "Asia", JP: "Asia", IN: "Asia", KR: "Asia", SG: "Asia", IL: "Asia", AE: "Asia",
  AU: "Oceania",
};

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

  // --- Continental breakdown ---
  const labsJsonPath = resolve(process.cwd(), "data/ai-labs.json");
  let labsJson: { displayName: string; country: string; orgs: string[] }[] = [];
  try {
    labsJson = JSON.parse(readFileSync(labsJsonPath, "utf8"));
  } catch { /* no labs json */ }

  const continents = buildContinentData(byCountry, allLabsRaw, labsJson);

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

  const scenes = buildScenes({
    topCards, topModels, biggestMovers, toolHealth, topRegion, mostActiveCity,
    hnTopStory, inferences, dateStr, sdkMovers, topAgents, topLabs, topRepos,
    continents, panelCounts, ecosystemStats,
  });

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
    continents,
    panelCounts,
    screenshots: { map: "map-global.png", mapZoom: "map-zoom.png" },
  };

  const outPath = resolve(process.cwd(), "data/video-daily.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(
    `Wrote ${outPath} (${scenes.length} scenes, ${continents.length} continents, ` +
    `${topCards.length} cards, ${topModels.length} models, ${biggestMovers.length} movers, ` +
    `${topLabs.length} labs, ${topAgents.length} agents, ${sdkMovers.length} SDK movers, ${topRepos.length} repos)`
  );
}

function buildContinentData(
  byCountry: Record<string, { current24h: number }>,
  labsApi: { displayName: string; total: number; repos: { owner: string; repo: string; total: number }[] }[],
  labsJson: { displayName: string; country: string; orgs: string[] }[],
): ContinentData[] {
  const continentMap = new Map<string, ContinentData>();

  for (const [country, data] of Object.entries(byCountry)) {
    const continent = COUNTRY_TO_CONTINENT[country] ?? "Other";
    if (continent === "Other") continue;
    if (!continentMap.has(continent)) {
      continentMap.set(continent, { name: continent, totalEvents: 0, topCountries: [], labs: [], topRepos: [] });
    }
    const cd = continentMap.get(continent)!;
    cd.totalEvents += data.current24h ?? 0;
    cd.topCountries.push({ country, events: data.current24h ?? 0 });
  }

  // Map labs to continents via labsJson country codes
  const labOrgToContinent = new Map<string, string>();
  for (const lab of labsJson) {
    const continent = LAB_COUNTRY_TO_CONTINENT[lab.country];
    if (continent) {
      for (const org of lab.orgs ?? []) {
        labOrgToContinent.set(org, continent);
      }
    }
  }

  for (const lab of labsApi) {
    let continent: string | undefined;
    for (const repo of lab.repos ?? []) {
      continent = labOrgToContinent.get(repo.owner);
      if (continent) break;
    }
    if (!continent) {
      // Fallback: guess from lab name
      const name = lab.displayName.toLowerCase();
      if (name.includes("openai") || name.includes("anthropic") || name.includes("meta") || name.includes("google")) continent = "North America";
      else if (name.includes("deepseek") || name.includes("baidu") || name.includes("tencent") || name.includes("alibaba") || name.includes("zhipu")) continent = "Asia";
      else if (name.includes("mistral") || name.includes("aleph")) continent = "Europe";
    }
    if (!continent) continue;

    if (!continentMap.has(continent)) {
      continentMap.set(continent, { name: continent, totalEvents: 0, topCountries: [], labs: [], topRepos: [] });
    }
    const cd = continentMap.get(continent)!;
    cd.labs.push({ name: lab.displayName, eventCount: lab.total });

    for (const repo of (lab.repos ?? []).slice(0, 2)) {
      cd.topRepos.push({ owner: repo.owner, repo: repo.repo, eventCount: repo.total });
    }
  }

  // Sort internals and pick top 3 continents by events
  for (const cd of continentMap.values()) {
    cd.topCountries.sort((a, b) => b.events - a.events);
    cd.topCountries = cd.topCountries.slice(0, 3);
    cd.labs.sort((a, b) => b.eventCount - a.eventCount);
    cd.labs = cd.labs.slice(0, 3);
    cd.topRepos.sort((a, b) => b.eventCount - a.eventCount);
    cd.topRepos = cd.topRepos.slice(0, 2);
  }

  return Array.from(continentMap.values())
    .sort((a, b) => b.totalEvents - a.totalEvents)
    .slice(0, 4);
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
      allRepos.push({ name: r.repo, owner: r.owner, stars: 0, eventCount: r.total, language: "" });
    }
  }
  allRepos.sort((a, b) => b.eventCount - a.eventCount);
  return allRepos.slice(0, 3);
}

function buildScenes(d: {
  topCards: VideoData["topCards"];
  topModels: VideoData["topModels"];
  biggestMovers: VideoData["biggestMovers"];
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
  continents: VideoData["continents"];
  panelCounts: VideoData["panelCounts"];
  ecosystemStats: VideoData["ecosystemStats"];
}): VideoData["scenes"] {
  const scenes: VideoData["scenes"] = [];

  // 1: Hero
  scenes.push({
    id: "hero",
    durationInSeconds: 8,
    narration: `Here's what moved in the AI ecosystem on ${formatDate(d.dateStr)}.`,
  });

  // 2: Global map overview
  scenes.push({
    id: "globe-overview",
    durationInSeconds: 6,
    narration: `${d.ecosystemStats.totalEvents} events across ${d.ecosystemStats.activeCountries} countries in the last 24 hours.`,
  });

  // 3-5: Continental zooms (top 3 by events)
  for (const cont of d.continents.slice(0, 3)) {
    const topCountry = cont.topCountries[0];
    const topLab = cont.labs[0];
    let narr = `${cont.name}: ${cont.totalEvents} events.`;
    if (topCountry) narr += ` ${topCountry.country} leads with ${topCountry.events}.`;
    if (topLab) narr += ` ${topLab.name} most active.`;
    scenes.push({
      id: `continent-${cont.name.toLowerCase().replace(/\s+/g, "-")}`,
      durationInSeconds: 8,
      narration: narr,
    });
  }

  // 6: Tool Health
  const degradedTools = d.toolHealth.tools.filter((t) => t.status !== "operational");
  scenes.push({
    id: "tools",
    durationInSeconds: 8,
    narration: degradedTools.length > 0
      ? `${d.toolHealth.operational} of ${d.toolHealth.total} tools operational. ${degradedTools.map((t) => `${t.name} reporting ${t.status}`).join(". ")}.`
      : `All ${d.toolHealth.total} AI coding tools fully operational.`,
  });

  // 7: Model Rankings (biggest movers + top 5)
  if (d.topModels.length > 0) {
    const moverParts = d.biggestMovers.map((m) => {
      const delta = (m.previousRank ?? m.rank) - m.rank;
      return `${m.shortName} ${delta > 0 ? "up" : "down"} ${Math.abs(delta)}`;
    });
    scenes.push({
      id: "models",
      durationInSeconds: 10,
      narration: `Model rankings. ${d.topModels[0].shortName} holds number 1.${moverParts.length > 0 ? ` Biggest movers: ${moverParts.join(", ")}.` : ""}`,
    });
  }

  // 8: SDK Adoption
  if (d.sdkMovers.length > 0) {
    const narParts = d.sdkMovers.map((s) => {
      const dir = s.diffPct > 0 ? "up" : "down";
      return `${s.name} ${dir} ${Math.abs(s.diffPct)}%`;
    });
    scenes.push({
      id: "sdk",
      durationInSeconds: 8,
      narration: `SDK adoption movers. ${narParts.join(". ")}.`,
    });
  }

  // 9: Wire Overview (panel counts)
  const totalItems = d.panelCounts.reduce((s, p) => s + p.count, 0);
  scenes.push({
    id: "wire-overview",
    durationInSeconds: 8,
    narration: `The ecosystem at a glance. ${totalItems} data points across ${d.panelCounts.length} categories. ${d.panelCounts.map((p) => `${p.count} ${p.label}`).join(", ")}.`,
  });

  // 10: Top Signals
  if (d.topCards.length > 0) {
    scenes.push({
      id: "feed",
      durationInSeconds: 8,
      narration: `Top signal: ${d.topCards[0].headline}.`,
    });
  }

  // 11: HN
  if (d.hnTopStory) {
    scenes.push({
      id: "hn",
      durationInSeconds: 7,
      narration: `Top on Hacker News: ${d.hnTopStory.title}. ${d.hnTopStory.points} points.`,
    });
  }

  // 12: Outro
  scenes.push({
    id: "outro",
    durationInSeconds: 7,
    narration: "Track it live at gawk dot dev. Subscribe for the daily digest.",
  });

  return scenes;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

main().catch((e) => { console.error(e); process.exit(1); });
