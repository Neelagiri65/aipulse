export type VideoScene = {
  id: string;
  durationInSeconds: number;
  narration: string;
};

export type VideoData = {
  generatedAt: string;
  date: string;
  scenes: VideoScene[];
  topCards: {
    headline: string;
    detail?: string;
    type: string;
    sourceName: string;
  }[];
  topModels: {
    rank: number;
    name: string;
    previousRank: number | null;
    isOpenWeight: boolean;
  }[];
  toolHealth: {
    operational: number;
    degraded: number;
    total: number;
    tools: { name: string; status: string }[];
  };
  topRegion: {
    country: string;
    deltaPct: number;
  } | null;
  mostActiveCity: {
    city: string;
    count: number;
  } | null;
  hnTopStory: {
    title: string;
    points: number;
    url: string;
  } | null;
  inferences: string[];
  ecosystemStats: {
    sources: number;
    crons: number;
    labs: number;
  };
  modelsFetchedAt: string | null;
  sdkMovers: {
    name: string;
    registry: string;
    diffPct: number;
  }[];
  topAgents: {
    name: string;
    weeklyDownloads: number;
  }[];
  topLabs: {
    name: string;
    eventCount: number;
    repoCount: number;
  }[];
  topRepos: {
    name: string;
    owner: string;
    stars: number;
    eventCount: number;
    language: string;
  }[];
  screenshots: {
    map: string;
    mapZoom: string;
  };
};
