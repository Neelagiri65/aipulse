export type CurationSource =
  | "gawk-models"
  | "gawk-tools"
  | "gawk-sdk"
  | "gawk-labs"
  | "gawk-wire"
  | "hn"
  | "reddit"
  | "arxiv"
  | "gdelt"
  | "github-trending"
  | "producthunt";

export type CurationEvent = {
  id: string;
  source: CurationSource;
  title: string;
  summary: string;
  url: string | null;
  timestamp: string;
  metrics: {
    points?: number;
    comments?: number;
    downloads?: number;
    stars?: number;
    deltaPct?: number;
    rank?: number;
    previousRank?: number;
  };
  geo: {
    country?: string;
    lat?: number;
    lng?: number;
  } | null;
  tags: string[];
};

export type AttentionScore = {
  surprise: number;
  crossSource: number;
  userImpact: number;
  controversy: number;
  recency: number;
  concreteNumber: number;
  total: number;
};

export type ScoredEvent = CurationEvent & {
  attention: AttentionScore;
};

export type Narrative = {
  id: string;
  headline: string;
  events: ScoredEvent[];
  attention: number;
  editorial: string;
  segment: "hook" | "lead" | "story" | "community" | "radar" | "map";
};

export type CurationResult = {
  generatedAt: string;
  date: string;
  narratives: Narrative[];
  totalEventsIngested: number;
  sourceCounts: Record<CurationSource, number>;
  language: string;
};
