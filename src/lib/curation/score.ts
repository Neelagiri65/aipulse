import type { CurationEvent, AttentionScore, ScoredEvent } from "./types";
import { preClusterDecay } from "./decay";

function surpriseScore(e: CurationEvent): number {
  const m = e.metrics;
  if (m.rank && m.previousRank) {
    const delta = Math.abs(m.previousRank - m.rank);
    if (delta >= 10) return 5;
    if (delta >= 5) return 4;
    if (delta >= 3) return 3;
  }
  if (m.deltaPct && Math.abs(m.deltaPct) > 50) return 4;
  if (m.deltaPct && Math.abs(m.deltaPct) > 20) return 3;
  if (e.source === "gawk-tools") return 4;
  return 1;
}

function crossSourceScore(e: CurationEvent, allEvents: CurationEvent[]): number {
  const titleWords = new Set(
    e.title.toLowerCase().split(/\s+/).filter(w => w.length > 4)
  );
  let matchingSources = new Set<string>();
  matchingSources.add(e.source);

  for (const other of allEvents) {
    if (other.id === e.id) continue;
    if (matchingSources.has(other.source)) continue;
    const otherWords = other.title.toLowerCase().split(/\s+/);
    const overlap = otherWords.filter(w => titleWords.has(w)).length;
    if (overlap >= 2) {
      matchingSources.add(other.source);
    }
  }

  const count = matchingSources.size;
  if (count >= 4) return 5;
  if (count >= 3) return 4;
  if (count >= 2) return 3;
  return 1;
}

function userImpactScore(e: CurationEvent): number {
  if (e.source === "gawk-tools") return 5;
  const m = e.metrics;
  if (m.downloads && m.deltaPct && Math.abs(m.deltaPct) > 30) return 4;
  if (m.points && m.points > 200) return 4;
  if (m.points && m.points > 100) return 3;
  if (m.comments && m.comments > 100) return 3;
  if (e.source === "gawk-sdk") return 3;
  return 1;
}

function controversyScore(e: CurationEvent): number {
  const m = e.metrics;
  if (m.points && m.comments) {
    const ratio = m.comments / Math.max(m.points, 1);
    if (ratio > 3) return 5;
    if (ratio > 2) return 4;
    if (ratio > 1.5) return 3;
  }
  return 1;
}

// recencyScore replaced by continuous temporal decay model (decay.ts).
// Signal, intent, and attention decay are applied as a multiplier on the
// raw attention score. Information decay runs post-cluster in cluster.ts.

function sourceCredibilityScore(e: CurationEvent): number {
  if (e.source === "arxiv") return 5;
  if (e.source === "gawk-models" || e.source === "gawk-sdk") return 4;
  if (e.source === "github-trending") return 3;
  if (/^(Tell HN|Ask HN|Show HN):/i.test(e.title)) return 1;
  if (/^(I built|I made|I created|My |Am I )/i.test(e.title)) return 1;
  return 2;
}

function concreteNumberScore(e: CurationEvent): number {
  const m = e.metrics;
  if (m.deltaPct && Math.abs(m.deltaPct) > 20) return 5;
  if (m.rank && m.previousRank) return 4;
  if (m.points && m.points > 50) return 3;
  if (m.stars && m.stars > 50) return 3;
  const hasNumber = /\d+%|\$[\d.]+|\d+ (stars|points|downloads)/.test(e.title);
  if (hasNumber) return 3;
  if (e.source === "arxiv") return 3;
  return 1;
}

export function scoreEvent(e: CurationEvent, allEvents: CurationEvent[]): ScoredEvent {
  const surprise = surpriseScore(e);
  const crossSource = crossSourceScore(e, allEvents);
  const userImpact = userImpactScore(e);
  const controversy = controversyScore(e);
  const concreteNumber = concreteNumberScore(e);
  const credibility = sourceCredibilityScore(e);

  const rawTotal =
    surprise * 3 +
    crossSource * 2 +
    userImpact * 2 +
    controversy * 1 +
    concreteNumber * 1 +
    credibility * 2;

  const scored: ScoredEvent = {
    ...e,
    attention: {
      surprise,
      crossSource,
      userImpact,
      controversy,
      recency: 0,
      concreteNumber,
      credibility,
      total: rawTotal,
    },
  };

  const decay = preClusterDecay(scored);
  scored.attention.recency = Math.round(decay * 100) / 100;
  scored.attention.total = Math.round(rawTotal * decay * 100) / 100;

  return scored;
}

export function scoreAll(events: CurationEvent[]): ScoredEvent[] {
  return events
    .map(e => scoreEvent(e, events))
    .sort((a, b) => b.attention.total - a.attention.total);
}
