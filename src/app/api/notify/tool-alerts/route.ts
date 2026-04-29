/**
 * Gawk — POST /api/notify/tool-alerts
 *
 * Cron-driven. Polls current tool health, derives TOOL_ALERT cards, computes
 * transitions against the cached state in Redis, and posts one Discord
 * webhook per transition (yellow / red / green per status). Persists the
 * new state hash so the next tick can dedup.
 *
 * Auth: shared INGEST_SECRET via withIngest.
 *
 * Graceful degradation:
 *   - DISCORD_TOOL_ALERTS_WEBHOOK_URL unset → returns ok with skipped:true.
 *     Detection runs but no embed is sent. This lets the cron stay healthy
 *     until the operator wires up the Discord server.
 *   - Redis unavailable → fail closed (state can't be persisted, so a fire
 *     would mean a guaranteed re-fire next tick = spam). Return ok:false
 *     and let the cron-health record show the degradation.
 *   - Discord 5xx → reported as failure (state NOT persisted), retry next
 *     tick. Discord 4xx → reported as failure, state persisted (don't keep
 *     hammering a permanently-bad webhook).
 */

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

import { withIngest } from "@/app/api/_lib/withIngest";
import { fetchAllStatus } from "@/lib/data/fetch-status";
import { deriveToolAlertCards } from "@/lib/feed/derivers/tool-alert";
import {
  buildAlertEmbed,
  buildRecoveryEmbed,
  postEmbeds,
} from "@/lib/notify/discord";
import {
  computeTransitions,
  toolDisplayNameFromHeadline,
  type CachedAlertState,
  type StateMap,
  type ToolAlertCard,
} from "@/lib/notify/tool-alert-transitions";
import type { ToolHealthStatus } from "@/components/health/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATE_KEY = "aipulse:tool-alerts:state";

type RouteResult = {
  alerted: number;
  recovered: number;
  alertsAttempted: number;
  webhookConfigured: boolean;
  redisConfigured: boolean;
  /** Set when something prevented sending. The cron stays healthy on
   *  no_webhook_url and no_redis (operator-pending). Discord errors are
   *  surfaced via cron-health failure. */
  skipped?: "no_webhook_url" | "no_redis";
  discordError?: string;
};

function loadRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function readState(redis: Redis): Promise<StateMap> {
  const raw = await redis.hgetall<Record<string, unknown>>(STATE_KEY);
  if (!raw) return {};
  const out: StateMap = {};
  for (const [key, value] of Object.entries(raw)) {
    const parsed = parseState(value);
    if (parsed) out[key] = parsed;
  }
  return out;
}

function parseState(value: unknown): CachedAlertState | null {
  let v: unknown = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.status !== "string" ||
    typeof o.alertedAt !== "string" ||
    typeof o.sourceUrl !== "string" ||
    typeof o.sourceName !== "string" ||
    typeof o.toolDisplayName !== "string"
  ) {
    return null;
  }
  return {
    status: o.status as ToolHealthStatus,
    alertedAt: o.alertedAt,
    sourceUrl: o.sourceUrl,
    sourceName: o.sourceName,
    toolDisplayName: o.toolDisplayName,
  };
}

async function writeState(
  redis: Redis,
  next: StateMap,
  recoveredKeys: string[],
): Promise<void> {
  if (recoveredKeys.length > 0) {
    await redis.hdel(STATE_KEY, ...recoveredKeys);
  }
  if (Object.keys(next).length > 0) {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(next)) {
      payload[k] = JSON.stringify(v);
    }
    await redis.hset(STATE_KEY, payload);
  }
}

export const POST = withIngest<RouteResult>({
  workflow: "notify-tool-alerts",
  run: async () => {
    const redis = loadRedis();
    if (!redis) {
      return {
        alerted: 0,
        recovered: 0,
        alertsAttempted: 0,
        webhookConfigured: Boolean(process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL),
        redisConfigured: false,
        skipped: "no_redis",
      };
    }

    const snapshot = await fetchAllStatus();
    const cards = deriveToolAlertCards(snapshot) as ToolAlertCard[];
    const previousState = await readState(redis);
    const { alerts, recoveries, nextState } = computeTransitions(
      cards,
      previousState,
    );

    const webhookConfigured = Boolean(
      process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL,
    );

    if (alerts.length === 0 && recoveries.length === 0) {
      // No diff — don't bother writing state (it's identical).
      return {
        alerted: 0,
        recovered: 0,
        alertsAttempted: 0,
        webhookConfigured,
        redisConfigured: true,
      };
    }

    const embeds: unknown[] = [];
    for (const t of alerts) {
      embeds.push(
        buildAlertEmbed({
          toolDisplayName: toolDisplayNameFromHeadline(t.card.headline),
          status: String(t.card.meta.status) as ToolHealthStatus,
          detail: t.card.detail ?? "",
          sourceUrl: t.card.sourceUrl,
          sourceName: t.card.sourceName,
          timestamp: t.card.timestamp,
        }),
      );
    }
    for (const r of recoveries) {
      embeds.push(
        buildRecoveryEmbed({
          toolDisplayName: r.state.toolDisplayName,
          previousStatus: r.state.status,
          sourceUrl: r.state.sourceUrl,
          sourceName: r.state.sourceName,
          timestamp: snapshot.polledAt,
        }),
      );
    }

    const discordResult = await postEmbeds(embeds);

    // Persist state ONLY when:
    //   - webhook is unconfigured (operator-pending; persisting prevents
    //     a flood of historical alerts the moment the URL is set)
    //   - send succeeded
    //   - send failed with 4xx (permanent — persisting stops the loop)
    // Don't persist on 5xx — that's a transient Discord outage; rely on
    // the next tick to retry.
    let persist = true;
    let discordError: string | undefined;
    if (discordResult.ok === false && "error" in discordResult) {
      discordError = discordResult.error;
      const is5xx = discordResult.status && discordResult.status >= 500;
      if (is5xx) persist = false;
    }

    if (persist) {
      const recoveredKeys = recoveries.map((r) => r.primaryKey);
      await writeState(redis, nextState, recoveredKeys);
    }

    const result: RouteResult = {
      alerted: discordResult.ok ? alerts.length : 0,
      recovered: discordResult.ok ? recoveries.length : 0,
      alertsAttempted: alerts.length + recoveries.length,
      webhookConfigured,
      redisConfigured: true,
    };
    if (!webhookConfigured) result.skipped = "no_webhook_url";
    if (discordError) result.discordError = discordError;
    return result;
  },
  toOutcome: (r) => {
    // ok if we successfully derived state, even when webhook is unconfigured
    // (operator-pending counts as healthy). Discord 5xx fails the cron so
    // the StatusBar surfaces the degradation.
    if (r.discordError) {
      return { ok: false, error: r.discordError };
    }
    return { ok: true, itemsProcessed: r.alertsAttempted };
  },
  toResponse: (r) =>
    NextResponse.json({ ok: !r.discordError, result: r }, { status: 200 }),
});

// GET aliases POST for cron-driven manual invocation parity with other
// ingest routes. Same INGEST_SECRET requirement.
export const GET = POST;
