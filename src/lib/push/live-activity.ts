/**
 * The tool-outage Live Activity rail (iOS Dynamic Island + Lock Screen).
 *
 * On a status flip to non-operational, gawk.dev starts an activity with each push-to-start token
 * whose stack includes the tool; on recovery it ends the activities running for that tool with their
 * own update tokens, then forgets those tokens. Same transport, provider token, targeting rule and
 * dead-token cleanup as the alert rail (`apns.ts`, `target.ts`).
 *
 * The `content-state` keys are a contract with the app: gawk-ios `ToolOutageState` decodes them with
 * a plain JSONDecoder, so times are epoch SECONDS (a JSON Date would decode 31 years off).
 */
import { APNS_HOSTS, APNS_TOPIC, EXPIRATION_SECONDS, defaultConnect, isDeadToken, providerToken, readApnsConfig, sendOnSession, type ApnsConfig, type ApnsHeaders, type ApnsSession, type Connect } from "@/lib/push/apns";
import { APNS_ENVS, isApnsToken, type ApnsEnv, type ApnsRecord } from "@/lib/push/apns-store";
import { selectRecipients } from "@/lib/push/target";
import { alertPushPayload, toolIdFromPrimaryKey } from "@/lib/notify/push-payloads";
import { toolDisplayNameFromHeadline, type AlertTransition, type RecoveryTransition } from "@/lib/notify/tool-alert-transitions";
import { createRedis } from "@/lib/redis-client";
import { parseStack, type ToolId } from "@/lib/stack";

export const LA_TOPIC = `${APNS_TOPIC}.push-type.liveactivity`;
export const LA_ATTRIBUTES_TYPE = "ToolOutageAttributes";
/** How long an ended activity lingers on the Lock Screen showing "operational". */
export const END_DISMISS_SECONDS = 15 * 60;

const epoch = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

/** The vendor's own word, underscores spoken: "major_outage" → "major outage". */
export function statusWord(status: string): string {
  return status.replace(/_/g, " ");
}

export function startPayload(t: AlertTransition, nowMs = Date.now()): object {
  const alert = alertPushPayload(t);
  const meta = t.card.meta as Record<string, unknown>;
  return {
    aps: {
      timestamp: Math.floor(nowMs / 1000),
      event: "start",
      "attributes-type": LA_ATTRIBUTES_TYPE,
      attributes: {
        toolId: typeof meta.toolId === "string" ? meta.toolId : toolIdFromPrimaryKey(t.primaryKey),
        toolName: toolDisplayNameFromHeadline(t.card.headline),
      },
      "content-state": {
        status: statusWord(String(meta.status)),
        // The vendor's incident title, or nothing — never the generic "status page reports" line.
        incident: typeof meta.incidentName === "string" && meta.incidentName ? meta.incidentName : null,
        since: epoch(t.card.timestamp),
        source: t.card.sourceName,
        checkedAt: Math.floor(nowMs / 1000),
      },
      // Required for push-to-start; carries source and time like every gawk push.
      alert: { title: alert.title, body: alert.body },
    },
  };
}

export function endPayload(r: RecoveryTransition, nowMs = Date.now()): object {
  const now = Math.floor(nowMs / 1000);
  return {
    aps: {
      timestamp: now,
      event: "end",
      "dismissal-date": now + END_DISMISS_SECONDS,
      "content-state": {
        status: "operational",
        incident: null,
        since: epoch(r.state.alertedAt),
        source: r.state.sourceName,
        checkedAt: now,
      },
    },
  };
}

export function laHeaders(token: string, jwt: string, nowMs = Date.now()): ApnsHeaders {
  return {
    ":method": "POST",
    ":path": `/3/device/${token}`,
    authorization: `bearer ${jwt}`,
    "apns-topic": LA_TOPIC,
    "apns-push-type": "liveactivity",
    "apns-priority": "10",
    "apns-expiration": String(Math.floor(nowMs / 1000) + EXPIRATION_SECONDS),
    "content-type": "application/json",
  };
}

// ── storage: two hashes per environment ────────────────────────────────────
export type ActivityRecord = { token: string; env: ApnsEnv; toolId: string; addedAt: string };
type RedisLike = {
  hset: (k: string, v: Record<string, string>) => Promise<unknown>;
  hdel: (k: string, f: string) => Promise<unknown>;
  hgetall: (k: string) => Promise<Record<string, unknown> | null>;
};
export const startKey = (env: ApnsEnv) => `apns:la:start:${env}`;
export const activityKey = (env: ApnsEnv) => `apns:la:activity:${env}`;

function loadRedis(): RedisLike | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return createRedis(url, token) as unknown as RedisLike;
}
const parse = (v: unknown): Record<string, unknown> | null => {
  if (typeof v === "string") { try { return JSON.parse(v) as Record<string, unknown>; } catch { return null; } }
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
};

export async function saveStartToken(token: string, env: ApnsEnv, tools: readonly ToolId[] | null, redis = loadRedis()) {
  if (!redis) return { ok: false as const, error: "redis_unavailable" };
  const scoped = tools && tools.length ? parseStack(JSON.stringify(tools)) : null;
  await redis.hset(startKey(env), { [token]: JSON.stringify({ tools: scoped && scoped.length ? scoped : null, addedAt: new Date().toISOString() }) });
  return { ok: true as const };
}
export async function removeStartToken(token: string, env: ApnsEnv, redis = loadRedis()) {
  if (!redis) return { ok: false };
  await redis.hdel(startKey(env), token);
  return { ok: true };
}
export async function getStartRecords(env: ApnsEnv, redis = loadRedis()): Promise<ApnsRecord[]> {
  if (!redis) return [];
  const all = (await redis.hgetall(startKey(env))) ?? {};
  return Object.entries(all).flatMap(([token, v]) => {
    const o = parse(v);
    if (!isApnsToken(token) || !o) return [];
    const tools = Array.isArray(o.tools) ? (parseStack(JSON.stringify(o.tools)) as ToolId[]) : null;
    return [{ token, env, tools: tools && tools.length ? tools : null, addedAt: String(o.addedAt ?? "") }];
  });
}
export async function saveActivityToken(token: string, toolId: string, env: ApnsEnv, redis = loadRedis()) {
  if (!redis) return { ok: false as const, error: "redis_unavailable" };
  await redis.hset(activityKey(env), { [token]: JSON.stringify({ toolId, addedAt: new Date().toISOString() }) });
  return { ok: true as const };
}
export async function removeActivityToken(token: string, env: ApnsEnv, redis = loadRedis()) {
  if (!redis) return 0;
  await redis.hdel(activityKey(env), token);
  return 1;
}
export async function getActivityRecords(env: ApnsEnv, redis = loadRedis()): Promise<ActivityRecord[]> {
  if (!redis) return [];
  const all = (await redis.hgetall(activityKey(env))) ?? {};
  return Object.entries(all).flatMap(([token, v]) => {
    const o = parse(v);
    if (!isApnsToken(token) || !o || typeof o.toolId !== "string") return [];
    return [{ token, env, toolId: o.toolId, addedAt: String(o.addedAt ?? "") }];
  });
}

// ── sending ────────────────────────────────────────────────────────────────
export type LiveActivityResult = { sent: number; failed: number; removed: number; skipped: number };
export type LiveActivityDeps = {
  config?: ApnsConfig | null;
  connect?: Connect | ((host: string) => Promise<ApnsSession>);
  nowMs?: number;
  timeoutMs?: number;
  startRecords?: (env: ApnsEnv) => Promise<ApnsRecord[]>;
  removeStart?: (token: string, env: ApnsEnv) => Promise<unknown>;
  activityRecords?: (env: ApnsEnv) => Promise<ActivityRecord[]>;
  removeActivity?: (token: string, env: ApnsEnv) => Promise<unknown>;
};

async function sendAll(tokens: { token: string; env: ApnsEnv }[], body: string, deps: LiveActivityDeps, cfg: ApnsConfig,
                       onDead: (token: string, env: ApnsEnv) => Promise<unknown>, onSent?: (token: string, env: ApnsEnv) => Promise<unknown>) {
  const out = { sent: 0, failed: 0, removed: 0 };
  const connect = deps.connect ?? defaultConnect;
  const jwt = providerToken(cfg, deps.nowMs);
  for (const env of APNS_ENVS) {
    const mine = tokens.filter((t) => t.env === env);
    if (mine.length === 0) continue;
    const session = await connect(APNS_HOSTS[env]);
    try {
      const results = await Promise.allSettled(mine.map((t) => sendOnSession(session, laHeaders(t.token, jwt, deps.nowMs), body, deps.timeoutMs)));
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (res.status === "fulfilled" && res.value.status === 200) {
          out.sent++;
          if (onSent) await onSent(mine[i].token, env);
          continue;
        }
        out.failed++;
        if (res.status === "fulfilled" && isDeadToken(res.value)) {
          await onDead(mine[i].token, env);
          out.removed++;
        }
      }
    } finally {
      session.close();
    }
  }
  return out;
}

export async function startLiveActivities(t: AlertTransition, deps: LiveActivityDeps = {}): Promise<LiveActivityResult> {
  const cfg = deps.config === undefined ? readApnsConfig() : deps.config;
  if (!cfg) return { sent: 0, failed: 0, removed: 0, skipped: 0 };
  const records = deps.startRecords ?? ((env) => getStartRecords(env));
  const toolId = (t.card.meta as Record<string, unknown>).toolId ?? toolIdFromPrimaryKey(t.primaryKey);
  let skipped = 0;
  const targets: ApnsRecord[] = [];
  for (const env of APNS_ENVS) {
    const all = await records(env);
    const chosen = selectRecipients(all, toolId);
    skipped += all.length - chosen.length;
    targets.push(...chosen);
  }
  const body = JSON.stringify(startPayload(t, deps.nowMs));
  const r = await sendAll(targets, body, deps, cfg, deps.removeStart ?? ((tok, env) => removeStartToken(tok, env)));
  return { ...r, skipped };
}

export async function endLiveActivities(r: RecoveryTransition, deps: LiveActivityDeps = {}): Promise<LiveActivityResult> {
  const cfg = deps.config === undefined ? readApnsConfig() : deps.config;
  if (!cfg) return { sent: 0, failed: 0, removed: 0, skipped: 0 };
  const records = deps.activityRecords ?? ((env) => getActivityRecords(env));
  const remove = deps.removeActivity ?? ((tok, env) => removeActivityToken(tok, env));
  const toolId = r.state.toolId || toolIdFromPrimaryKey(r.primaryKey);
  const targets: ActivityRecord[] = [];
  let skipped = 0;
  for (const env of APNS_ENVS) {
    const all = await records(env);
    const mine = all.filter((a) => a.toolId === toolId);
    skipped += all.length - mine.length;
    targets.push(...mine);
  }
  const body = JSON.stringify(endPayload(r, deps.nowMs));
  // An ended activity's token is spent: forget it whether Apple took the end or called it dead.
  const res = await sendAll(targets, body, deps, cfg, remove, remove);
  return { ...res, skipped };
}
