/**
 * Containment loop — the actuator (pure).
 *
 * `applyContainment()` is the single chokepoint that turns persisted
 * containment state into display consequences on a FeedResponse. Every
 * consumer of `loadFeedResponse` (homepage, /board, share cards,
 * /api/feed, /api/v1/feed) inherits it from the one call site in load.ts —
 * trust invariants inlined at multiple call sites diverge (S45/S48b).
 *
 * Actuation semantics per state:
 *   QUARANTINED — derived cards for the source are suppressed, its ticker
 *                 numbers are blanked to the honest empty, and a
 *                 ContainedSource disclosure (reasons + last-known anchor)
 *                 travels with the response for the tile to render.
 *   SUSPECT / RECOVERING — NO display change (hysteresis gates actuation
 *                 only; the existing stale/degraded disclosures remain
 *                 unconditional — Auditor change 6).
 *   state missing / unreadable / stale — data serves as-is, standing
 *                 quarantines in a STALE state still apply (sticky,
 *                 Auditor change 2), and `monitoringImpaired` is set as an
 *                 ADDITIVE badge. A monitoring failure must never silently
 *                 restore a quarantined source.
 *
 * Milestone-1 surface inventory (Auditor change 7):
 *   COVERED here: everything consuming loadFeedResponse — homepage, /board,
 *     /feed/[cardId] share pages + OG images, /api/feed, /api/v1/feed —
 *     for the openrouter-rankings and sdk-adoption sources.
 *   DEFERRED (own disclosure/probes, actuation in fast-follows): panel
 *     routes (model-usage, sdk-adoption, agents, producthunt — panels
 *     already render per-DTO caveats), /api/v1/agents, /api/v1/sdk,
 *     digest, push/tool-alerts, globe (honest-empty already), video
 *     (own hard gates). The "feed" probe is intentionally not actuated:
 *     suppressing the feed because the feed's own probe failed is
 *     circular — that failure pages via integrity-watch instead.
 */

import { CRON_WORKFLOWS } from "@/lib/data/cron-health";
import type {
  CardType,
  ContainedSource,
  FeedResponse,
} from "@/lib/feed/types";

import type { StateReadResult } from "./store";

/** Per-source actuation policy. Only sources with an entry actuate —
 *  a probe without a policy observes (shadow) but never changes display. */
export const CONTAINMENT_POLICY: Record<
  string,
  {
    /** Display name matching card.sourceName / board Domain.sourceName. */
    displayName: string;
    /** Card types derived from this source, suppressed under quarantine. */
    suppressTypes: CardType[];
    /** Blank this source's ticker numbers to the honest empty. */
    suppressCurrentState?: (
      cs: FeedResponse["currentState"],
    ) => FeedResponse["currentState"];
  }
> = {
  "openrouter-rankings": {
    displayName: "OpenRouter",
    suppressTypes: ["MODEL_MOVER"],
    suppressCurrentState: (cs) => ({
      ...cs,
      topModel: { name: "—", sourceUrl: "https://openrouter.ai" },
    }),
  },
  "sdk-adoption": {
    displayName: "SDK registries",
    suppressTypes: ["SDK_TREND"],
  },
};

/** Containment state older than 2× the probe cadence is UNKNOWN — the
 *  cadence is read from the SAME cron-health declaration the beacon uses. */
export const STATE_STALE_MS =
  CRON_WORKFLOWS["containment-cycle"].expectedIntervalMinutes * 2 * 60_000;

export function applyContainment(
  response: FeedResponse,
  read: StateReadResult,
  nowMs: number,
): FeedResponse {
  // No state to apply: serve as-is + the additive UNKNOWN badge. There are
  // no standing quarantines to preserve because none are readable; that gap
  // is exactly what the badge discloses.
  if (read.error || read.state === null) {
    return { ...response, monitoringImpaired: true };
  }

  const stale = nowMs - read.state.computedAt > STATE_STALE_MS;

  const contained: ContainedSource[] = [];
  const suppress = new Set<CardType>();
  let currentState = response.currentState;

  for (const [sourceId, policy] of Object.entries(CONTAINMENT_POLICY)) {
    const rec = read.state.sources[sourceId];
    // Sticky in the trust direction: a quarantine in a STALE state still
    // actuates. Only an explicit probe-passed restore lifts it.
    if (!rec || rec.state !== "quarantined") continue;
    for (const t of policy.suppressTypes) suppress.add(t);
    if (policy.suppressCurrentState) {
      currentState = policy.suppressCurrentState(currentState);
    }
    contained.push({
      source: policy.displayName,
      reasons: rec.reason ? [rec.reason] : ["output probe failing"],
      lastKnownAt: rec.lastPassKey,
    });
  }

  let out = response;
  if (contained.length > 0) {
    out = {
      ...out,
      cards: out.cards.filter((c) => !suppress.has(c.type)),
      currentState,
      containedSources: contained,
    };
  }
  if (stale) out = { ...out, monitoringImpaired: true };
  return out;
}
