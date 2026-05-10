import type { ScoredEvent, Narrative } from "./types";
import { narrativeDecay } from "./decay";

function normaliseWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const w of a) {
    if (b.has(w)) overlap++;
  }
  return overlap / Math.min(a.size, b.size);
}

export function deduplicate(events: ScoredEvent[], threshold = 0.6): ScoredEvent[] {
  const kept: ScoredEvent[] = [];
  const keptWords: Set<string>[] = [];

  for (const e of events) {
    const words = normaliseWords(e.title + " " + e.summary);
    const isDupe = keptWords.some((kw) => similarity(words, kw) >= threshold);
    if (!isDupe) {
      kept.push(e);
      keptWords.push(words);
    }
  }

  return kept;
}

export function clusterEvents(
  events: ScoredEvent[],
  simThreshold = 0.35
): ScoredEvent[][] {
  const wordSets = events.map((e) => normaliseWords(e.title + " " + e.summary));
  const assigned = new Set<number>();
  const clusters: ScoredEvent[][] = [];

  for (let i = 0; i < events.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [events[i]];
    assigned.add(i);

    for (let j = i + 1; j < events.length; j++) {
      if (assigned.has(j)) continue;
      if (similarity(wordSets[i], wordSets[j]) >= simThreshold) {
        cluster.push(events[j]);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

type Segment = Narrative["segment"];

function assignSegment(rank: number, cluster: ScoredEvent[]): Segment {
  if (rank === 0) return "hook";
  if (rank === 1) return "lead";

  const hasGeo = cluster.some((e) => e.geo?.lat != null);
  if (hasGeo) return "map";

  const isRadar =
    cluster.length === 1 &&
    (cluster[0].source === "arxiv" || cluster[0].source === "github-trending");
  if (isRadar) return "radar";

  const isCommunity = cluster.some(
    (e) => e.source === "reddit" || e.source === "hn"
  );
  if (isCommunity) return "community";

  return "story";
}

export function buildNarratives(
  events: ScoredEvent[],
  maxNarratives = 6
): Narrative[] {
  const deduped = deduplicate(events);
  const clusters = clusterEvents(deduped);

  const ranked = clusters
    .map((cluster) => {
      const rawScore = cluster.reduce((s, e) => s + e.attention.total, 0);
      const decay = narrativeDecay(cluster);
      return { cluster, score: Math.round(rawScore * decay * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxNarratives);

  return ranked.map(({ cluster, score }, i) => {
    const lead = cluster[0];
    return {
      id: `narrative-${i}`,
      headline: lead.title,
      events: cluster,
      attention: score,
      editorial: "",
      segment: assignSegment(i, cluster),
    };
  });
}
