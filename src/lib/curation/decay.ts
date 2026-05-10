import type { CurationSource, ScoredEvent } from "./types";

// --- Per-source decay parameters (PRD Section 7) ---

type DecayParams = {
  signalGravity: number;
  intentHalfLifeH: number;
  attentionHalfLifeH: number;
};

const SOURCE_DECAY: Record<CurationSource, DecayParams> = {
  "gawk-tools":       { signalGravity: 2.5,  intentHalfLifeH: 4,   attentionHalfLifeH: 6   },
  "gawk-models":      { signalGravity: 1.5,  intentHalfLifeH: 24,  attentionHalfLifeH: 48  },
  "gawk-sdk":         { signalGravity: 1.2,  intentHalfLifeH: 48,  attentionHalfLifeH: 72  },
  "gawk-labs":        { signalGravity: 1.4,  intentHalfLifeH: 24,  attentionHalfLifeH: 48  },
  "gawk-wire":        { signalGravity: 1.8,  intentHalfLifeH: 12,  attentionHalfLifeH: 24  },
  "hn":               { signalGravity: 1.8,  intentHalfLifeH: 12,  attentionHalfLifeH: 24  },
  "reddit":           { signalGravity: 1.6,  intentHalfLifeH: 18,  attentionHalfLifeH: 36  },
  "arxiv":            { signalGravity: 0.8,  intentHalfLifeH: 168, attentionHalfLifeH: 120 },
  "gdelt":            { signalGravity: 1.4,  intentHalfLifeH: 24,  attentionHalfLifeH: 48  },
  "github-trending":  { signalGravity: 1.0,  intentHalfLifeH: 72,  attentionHalfLifeH: 96  },
  "producthunt":      { signalGravity: 1.3,  intentHalfLifeH: 36,  attentionHalfLifeH: 48  },
};

const DECAY_WEIGHTS = {
  signal: 0.35,
  intent: 0.25,
  attention: 0.15,
  // information (0.25) is applied post-cluster in cluster.ts
} as const;

const PRE_CLUSTER_WEIGHT_SUM =
  DECAY_WEIGHTS.signal + DECAY_WEIGHTS.intent + DECAY_WEIGHTS.attention;

// --- Decay functions ---

function hoursAge(timestamp: string): number {
  return Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 3_600_000);
}

/**
 * HN-style gravity: 1 / (t + 2)^G
 * Returns 0..1 (normalised to t=0 baseline)
 */
function signalDecay(source: CurationSource, h: number): number {
  const g = (SOURCE_DECAY[source] ?? SOURCE_DECAY["gawk-wire"]).signalGravity;
  return Math.pow(2, g) / Math.pow(h + 2, g);
}

/**
 * Exponential decay: e^(-lambda * t), lambda = ln(2) / halfLife
 */
function exponentialDecay(halfLifeH: number, h: number): number {
  const lambda = Math.LN2 / halfLifeH;
  return Math.exp(-lambda * h);
}

function intentDecay(source: CurationSource, h: number): number {
  const hl = (SOURCE_DECAY[source] ?? SOURCE_DECAY["gawk-wire"]).intentHalfLifeH;
  return exponentialDecay(hl, h);
}

function attentionDecay(source: CurationSource, h: number): number {
  const hl = (SOURCE_DECAY[source] ?? SOURCE_DECAY["gawk-wire"]).attentionHalfLifeH;
  return exponentialDecay(hl, h);
}

/**
 * Pre-cluster decay multiplier: signal + intent + attention (normalised to 0..1).
 * Information decay is applied separately after clustering.
 */
export function preClusterDecay(event: ScoredEvent): number {
  const h = hoursAge(event.timestamp);
  const s = signalDecay(event.source, h);
  const i = intentDecay(event.source, h);
  const a = attentionDecay(event.source, h);

  return (
    s * DECAY_WEIGHTS.signal +
    i * DECAY_WEIGHTS.intent +
    a * DECAY_WEIGHTS.attention
  ) / PRE_CLUSTER_WEIGHT_SUM;
}

/**
 * Information decay: supersession check within a cluster.
 * If a newer event in the same cluster exists, this event's value drops.
 * Returns a multiplier 0..1.
 */
export function informationDecay(
  event: ScoredEvent,
  cluster: ScoredEvent[]
): number {
  const eventTime = new Date(event.timestamp).getTime();
  const newerCount = cluster.filter(
    (e) => e.id !== event.id && new Date(e.timestamp).getTime() > eventTime
  ).length;

  if (newerCount === 0) return 1.0;
  if (newerCount === 1) return 0.6;
  if (newerCount === 2) return 0.35;
  return 0.2;
}

/**
 * Full composite decay for a narrative (post-cluster).
 * Combines pre-cluster decay (already applied to individual events)
 * with information decay across the cluster.
 */
export function narrativeDecay(cluster: ScoredEvent[]): number {
  if (cluster.length === 0) return 0;

  const lead = cluster[0];
  const preDecay = preClusterDecay(lead);

  const infoDecay = informationDecay(lead, cluster);

  const INFO_WEIGHT = 0.25;
  const PRE_WEIGHT = 1 - INFO_WEIGHT;

  return preDecay * PRE_WEIGHT + infoDecay * INFO_WEIGHT;
}

export { SOURCE_DECAY, DECAY_WEIGHTS, hoursAge };
