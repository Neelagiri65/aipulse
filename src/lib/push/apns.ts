/**
 * APNs sender — the native-app rail beside web push (`send.ts`).
 *
 * Provider auth is a JWT (ES256) signed with the team's `.p8` key
 * (APNS_P8, key id APNS_KEY_ID, team APNS_TEAM_ID — env on Vercel, Keychain
 * locally, never in a repo). Apple rejects provider tokens older than an
 * hour and asks for no more than one refresh per 20 minutes, so the token
 * is minted once per warm instance and reminted after 50 minutes.
 *
 * Transport is HTTP/2 (`node:http2`): ONE session per broadcast, every
 * stream multiplexed on it, hard 5 s timeout per request so a stalled
 * stream cannot hold the tool-alerts function open. The session factory is
 * injectable so tests run the real code path against a fake.
 *
 * Every push carries `apns-expiration` 30 minutes out: a "Claude is down"
 * delivered three hours late is a false claim, so it is dropped instead.
 *
 * Unconfigured (any of the three env vars absent) is a NO-OP that returns
 * zeros — the cron must not go red between the PR landing and the founder
 * setting the env. Same contract as `configureWebPush()`.
 *
 * Cleanup mirrors web push: 410 `Unregistered` and 400 `BadDeviceToken`
 * delete the token; anything else is a transient failure and the token stays.
 */
import { createSign } from "node:crypto";
import type { PushPayload } from "./send";
import { selectRecipients } from "./target";
import {
  APNS_ENVS,
  getApnsRecords,
  removeApnsToken,
  type ApnsEnv,
  type ApnsRecord,
} from "./apns-store";

export const APNS_TOPIC = "dev.gawk.ios";
export const APNS_HOSTS: Record<ApnsEnv, string> = {
  sandbox: "https://api.sandbox.push.apple.com:443",
  production: "https://api.push.apple.com:443",
};
export const PROVIDER_TOKEN_TTL_MS = 50 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 5_000;
export const EXPIRATION_SECONDS = 30 * 60;

export type ApnsConfig = { keyId: string; teamId: string; p8: string };

export function readApnsConfig(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID;
  const teamId = env.APNS_TEAM_ID;
  const p8 = env.APNS_P8;
  if (!keyId || !teamId || !p8) return null;
  // A Vercel paste may carry literal "\n"; the PEM needs real newlines.
  return { keyId, teamId, p8: p8.replace(/\\n/g, "\n") };
}

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** ES256 JWT with `kid` in the header and `iss`/`iat` claims — what APNs checks. */
export function mintProviderToken(cfg: ApnsConfig, nowMs = Date.now()): string {
  const unsigned = `${b64url({ alg: "ES256", kid: cfg.keyId })}.${b64url({ iss: cfg.teamId, iat: Math.floor(nowMs / 1000) })}`;
  const signer = createSign("SHA256");
  signer.update(unsigned);
  const sig = signer.sign({ key: cfg.p8, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${unsigned}.${sig}`;
}

type Cached = { token: string; mintedAt: number; keyId: string };
let cached: Cached | null = null;

/** Cached per warm instance; reminted after 50 min or when the key id changes. */
export function providerToken(cfg: ApnsConfig, nowMs = Date.now()): string {
  if (cached && cached.keyId === cfg.keyId && nowMs - cached.mintedAt < PROVIDER_TOKEN_TTL_MS) {
    return cached.token;
  }
  cached = { token: mintProviderToken(cfg, nowMs), mintedAt: nowMs, keyId: cfg.keyId };
  return cached.token;
}

/** Test seam. */
export function resetProviderTokenCache(): void {
  cached = null;
}

/** The APNs body: `aps` for the system, our fields beside it for the app's Sourced<T>. */
export function apnsBody(payload: PushPayload): string {
  return JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      // No sound and no badge by default (iOS PRD §14). Time-sensitive
      // interruption for outages needs its own entitlement — later.
      "thread-id": payload.tag ?? "gawk",
    },
    url: payload.url ?? null,
    toolId: payload.toolId ?? null,
    source: payload.source ?? null,
    generatedAt: payload.generatedAt ?? null,
  });
}

export type ApnsHeaders = Record<string, string>;

export function apnsHeaders(token: string, jwt: string, payload: PushPayload, nowMs = Date.now()): ApnsHeaders {
  const h: ApnsHeaders = {
    ":method": "POST",
    ":path": `/3/device/${token}`,
    authorization: `bearer ${jwt}`,
    "apns-topic": APNS_TOPIC,
    "apns-push-type": "alert",
    "apns-priority": "10",
    "apns-expiration": String(Math.floor(nowMs / 1000) + EXPIRATION_SECONDS),
    "content-type": "application/json",
  };
  if (payload.tag) h["apns-collapse-id"] = payload.tag.slice(0, 64);
  return h;
}

/** The slice of an http2 session the sender uses — what tests fake. */
export type ApnsStream = {
  on: (ev: "response" | "data" | "end" | "error", fn: (...a: never[]) => void) => unknown;
  end: (body: string) => void;
  close?: () => void;
};
export type ApnsSession = {
  request: (headers: ApnsHeaders) => ApnsStream;
  close: () => void;
  on?: (ev: "error", fn: (e: Error) => void) => unknown;
};
export type Connect = (host: string) => ApnsSession;

export type SendOutcome = { status: number; reason: string | null };

export function sendOnSession(
  session: ApnsSession,
  headers: ApnsHeaders,
  body: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<SendOutcome> {
  return new Promise<SendOutcome>((resolve, reject) => {
    let status = 0;
    let text = "";
    let done = false;
    const stream = session.request(headers);
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      stream.close?.();
      reject(new Error("apns_timeout"));
    }, timeoutMs);
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };
    stream.on("response", ((h: Record<string, unknown>) => {
      status = Number(h[":status"] ?? 0);
    }) as never);
    stream.on("data", ((c: Buffer | string) => {
      text += c.toString();
    }) as never);
    stream.on("end", (() => {
      let reason: string | null = null;
      try {
        reason = text ? (JSON.parse(text).reason ?? null) : null;
      } catch {
        reason = text || null;
      }
      finish(() => resolve({ status, reason }));
    }) as never);
    stream.on("error", ((e: Error) => finish(() => reject(e))) as never);
    stream.end(body);
  });
}

async function defaultConnect(host: string): Promise<ApnsSession> {
  const http2 = await import("node:http2");
  // Happy Eyeballs. Apple publishes AAAA and A records; a network whose IPv6
  // route is dead (this Mac, 2026-09-23: 3/3 ETIMEDOUT on the default
  // connect, 6/6 ok with this) would otherwise time out every push while a
  // single-family probe looked fine. Both families are tried, 300 ms apart.
  // (net.connect options; the http2 typings do not list them.)
  const options = { autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 300 } as unknown as Parameters<typeof http2.connect>[1];
  const session = http2.connect(host, options);
  // A session-level failure (DNS, TCP timeout, TLS) surfaces on every open
  // stream as its own "error", which sendOnSession turns into a rejection —
  // a transient failure that keeps the token. Without THIS listener the same
  // event is an unhandled EventEmitter error and takes the process down.
  session.on("error", () => {});
  return session as unknown as ApnsSession;
}

export type ApnsBroadcastResult = {
  sent: number;
  failed: number;
  removed: number;
  skipped: number;
  /** Which environments actually had tokens. */
  envs: ApnsEnv[];
};

const ZERO: ApnsBroadcastResult = { sent: 0, failed: 0, removed: 0, skipped: 0, envs: [] };

export type BroadcastDeps = {
  connect?: Connect | ((host: string) => Promise<ApnsSession>);
  config?: ApnsConfig | null;
  records?: (env: ApnsEnv) => Promise<ApnsRecord[]>;
  remove?: (token: string, env: ApnsEnv) => Promise<unknown>;
  nowMs?: number;
  /** Per-request timeout; tests shorten it. */
  timeoutMs?: number;
};

/** True when the token must be forgotten: Apple says it will never work again. */
export function isDeadToken(o: SendOutcome): boolean {
  return (o.status === 410 && o.reason === "Unregistered") || (o.status === 400 && o.reason === "BadDeviceToken");
}

/**
 * Send one payload to every stored token, per environment. Targeting by
 * `toolId` is the same rule as web push (`target.ts`).
 */
export async function broadcastApns(payload: PushPayload, deps: BroadcastDeps = {}): Promise<ApnsBroadcastResult> {
  const cfg = deps.config === undefined ? readApnsConfig() : deps.config;
  if (!cfg) return { ...ZERO };
  const records = deps.records ?? ((env) => getApnsRecords(env));
  const remove = deps.remove ?? ((token, env) => removeApnsToken(token, env));
  const connect = deps.connect ?? defaultConnect;
  const jwt = providerToken(cfg, deps.nowMs);
  const body = apnsBody(payload);
  const out: ApnsBroadcastResult = { ...ZERO, envs: [] };

  for (const env of APNS_ENVS) {
    const all = await records(env);
    if (all.length === 0) continue;
    out.envs.push(env);
    const targets = selectRecipients(all, payload.toolId);
    out.skipped += all.length - targets.length;
    if (targets.length === 0) continue;
    const session = await connect(APNS_HOSTS[env]);
    try {
      const results = await Promise.allSettled(
        targets.map((r) => sendOnSession(session, apnsHeaders(r.token, jwt, payload, deps.nowMs), body, deps.timeoutMs)),
      );
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (res.status === "fulfilled" && res.value.status === 200) {
          out.sent++;
          continue;
        }
        out.failed++;
        if (res.status === "fulfilled" && isDeadToken(res.value)) {
          await remove(targets[i].token, env);
          out.removed++;
        }
      }
    } finally {
      session.close();
    }
  }
  return out;
}

/** One device, one push — the ops probe behind `/api/push/apns/send`. */
export async function sendApnsToOne(
  token: string,
  env: ApnsEnv,
  payload: PushPayload,
  deps: BroadcastDeps = {},
): Promise<SendOutcome | { status: 0; reason: "unconfigured" }> {
  const cfg = deps.config === undefined ? readApnsConfig() : deps.config;
  if (!cfg) return { status: 0, reason: "unconfigured" };
  const connect = deps.connect ?? defaultConnect;
  const session = await connect(APNS_HOSTS[env]);
  try {
    return await sendOnSession(session, apnsHeaders(token, providerToken(cfg, deps.nowMs), payload, deps.nowMs), apnsBody(payload), deps.timeoutMs);
  } finally {
    session.close();
  }
}
