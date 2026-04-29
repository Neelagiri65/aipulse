/**
 * Gawk — Tool-alert transition detector.
 *
 * Pure function over (current TOOL_ALERT cards, previous-state hash). Returns
 * three lists:
 *   - alerts: tools whose status is non-operational AND differs from the
 *     last cached status (new alert OR change of severity, e.g. degraded →
 *     major_outage).
 *   - recoveries: tools that were cached as non-operational but no longer
 *     have a TOOL_ALERT card (back to green).
 *   - nextState: the hash to write back so the next tick can dedup.
 *
 * No IO. No clock reads outside the caller passing `now`. Test-only inputs.
 *
 * The dedup contract is the architectural-constraint test for this module —
 * if it stops holding, Discord starts spamming on every cron tick. Two tests
 * pin it: (1) two consecutive ticks of the same status emit one alert; (2)
 * a status change inside an alert (degraded → major_outage) re-emits.
 */
import type { ToolHealthStatus } from "@/components/health/tools";
import type { Card } from "@/lib/feed/types";

export type ToolAlertCard = Card & { type: "TOOL_ALERT" };

export type CachedAlertState = {
  /** The status that was last alerted on. */
  status: ToolHealthStatus;
  /** ISO timestamp the alert was emitted. Informational. */
  alertedAt: string;
  /** Source URL the embed should link to on a recovery. */
  sourceUrl: string;
  /** Source name for the recovery embed footer. */
  sourceName: string;
  /** Display name of the tool — preserved so a recovery message can name
   *  the tool without re-deriving it after the alert card has gone away. */
  toolDisplayName: string;
};

export type StateMap = Record<string, CachedAlertState>;

export type AlertTransition = {
  kind: "alert";
  primaryKey: string;
  card: ToolAlertCard;
  /** Previous status if known — used for "X went from degraded to major_outage"
   *  copy in the future. Undefined when this is a brand-new alert. */
  previousStatus?: ToolHealthStatus;
};

export type RecoveryTransition = {
  kind: "recovery";
  primaryKey: string;
  state: CachedAlertState;
};

export type Transitions = {
  alerts: AlertTransition[];
  recoveries: RecoveryTransition[];
  nextState: StateMap;
};

/**
 * Build the primary key used to dedup against the cache. Mirrors the
 * `primaryKey` the TOOL_ALERT deriver uses internally.
 */
export function primaryKeyFor(card: ToolAlertCard): string {
  const sourceId = String(card.meta.statusSourceId ?? "");
  const toolId = String(card.meta.toolId ?? "");
  return `${sourceId}:${toolId}`;
}

/**
 * Strip "X is reporting " or "X has an active incident: " from the headline
 * to recover the tool's display name. The TOOL_ALERT deriver builds the
 * headline from `${displayName} is reporting ${...}` or `${displayName} has
 * an active incident: ${...}`, so reversing it is deterministic.
 */
export function toolDisplayNameFromHeadline(headline: string): string {
  const isReporting = headline.indexOf(" is reporting ");
  if (isReporting > 0) return headline.slice(0, isReporting);
  const hasIncident = headline.indexOf(" has an active incident:");
  if (hasIncident > 0) return headline.slice(0, hasIncident);
  return headline;
}

export function computeTransitions(
  currentCards: ToolAlertCard[],
  previousState: StateMap,
): Transitions {
  const alerts: AlertTransition[] = [];
  const recoveries: RecoveryTransition[] = [];
  const nextState: StateMap = {};

  const currentByKey = new Map<string, ToolAlertCard>();
  for (const card of currentCards) {
    currentByKey.set(primaryKeyFor(card), card);
  }

  for (const [primaryKey, card] of currentByKey) {
    const cardStatus = String(card.meta.status) as ToolHealthStatus;
    const cached = previousState[primaryKey];
    const isNew = !cached || cached.status !== cardStatus;

    if (isNew) {
      alerts.push({
        kind: "alert",
        primaryKey,
        card,
        previousStatus: cached?.status,
      });
    }

    nextState[primaryKey] = {
      status: cardStatus,
      alertedAt: isNew ? card.timestamp : (cached?.alertedAt ?? card.timestamp),
      sourceUrl: card.sourceUrl,
      sourceName: card.sourceName,
      toolDisplayName: toolDisplayNameFromHeadline(card.headline),
    };
  }

  for (const [primaryKey, state] of Object.entries(previousState)) {
    if (!currentByKey.has(primaryKey)) {
      recoveries.push({ kind: "recovery", primaryKey, state });
    }
  }

  return { alerts, recoveries, nextState };
}
