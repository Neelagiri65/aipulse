export type VideoScene = {
  id: string;
  durationInSeconds: number;
  narration: string;
};

export type ContinentData = {
  name: string;
  totalEvents: number;
  topCountries: { country: string; events: number }[];
  labs: { name: string; eventCount: number }[];
  topRepos: { owner: string; repo: string; eventCount: number }[];
};

export type ModelEntry = {
  rank: number;
  name: string;
  shortName: string;
  previousRank: number | null;
  isOpenWeight: boolean;
  promptPrice: number | null;
  completionPrice: number | null;
  contextLength: number | null;
};

export type PanelCount = {
  label: string;
  count: number;
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
  topModels: ModelEntry[];
  biggestMovers: ModelEntry[];
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
    totalEvents: number;
    activeCountries: number;
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
  continents: ContinentData[];
  panelCounts: PanelCount[];
  screenshots: {
    map: string;
    mapZoom: string;
  };
};
