/**
 * The APNs sender against a fake HTTP/2 session: the provider token Apple
 * checks, the headers and body every push carries, which outcomes delete a
 * token, and that an unconfigured rail is a no-op rather than an error.
 */
import { createVerify, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  APNS_HOSTS,
  apnsBody,
  apnsHeaders,
  broadcastApns,
  isDeadToken,
  mintProviderToken,
  providerToken,
  readApnsConfig,
  resetProviderTokenCache,
  sendApnsToOne,
  sendOnSession,
  type ApnsSession,
  type ApnsStream,
} from "@/lib/push/apns";
import type { ApnsRecord } from "@/lib/push/apns-store";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const cfg = { keyId: "7ZW27RXZSD", teamId: "6C4U4QF7DL", p8: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
const payload = { title: "gawk.dev: Claude Code degraded", body: "Elevated errors", url: "https://gawk.dev", tag: "tool-alert-Claude Code", toolId: "claude-code", source: "Anthropic Status", generatedAt: "2026-09-23T09:00:00Z" };
const TOKEN = "b".repeat(64);

function fakeSession(reply: (headers: Record<string, string>) => { status: number; body?: string; hang?: boolean }): ApnsSession & { closed: boolean; requests: Record<string, string>[] } {
  const s = { closed: false, requests: [] as Record<string, string>[], close() { s.closed = true; }, request(headers: Record<string, string>): ApnsStream {
    s.requests.push(headers);
    const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
    const stream: ApnsStream = {
      on(ev, fn) { (handlers[ev] ??= []).push(fn as (...a: unknown[]) => void); return stream; },
      end() {
        const r = reply(headers);
        if (r.hang) return;
        queueMicrotask(() => {
          handlers.response?.forEach((f) => f({ ":status": r.status }));
          if (r.body) handlers.data?.forEach((f) => f(Buffer.from(r.body!)));
          handlers.end?.forEach((f) => f());
        });
      },
    };
    return stream;
  } };
  return s;
}

beforeEach(() => resetProviderTokenCache());

describe("provider token — what Apple verifies", () => {
  it("is an ES256 JWT with kid in the header, iss + iat in the claims, and a signature the public key verifies", () => {
    const t0 = Date.parse("2026-09-23T09:00:00Z");
    const jwt = mintProviderToken(cfg, t0);
    const [h, c, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "7ZW27RXZSD" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ iss: "6C4U4QF7DL", iat: Math.floor(t0 / 1000) });
    const v = createVerify("SHA256");
    v.update(`${h}.${c}`);
    expect(v.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
  });
  it("is reused inside 50 minutes and reminted after", () => {
    const t0 = Date.parse("2026-09-23T09:00:00Z");
    const a = providerToken(cfg, t0);
    expect(providerToken(cfg, t0 + 49 * 60_000)).toBe(a);
    expect(providerToken(cfg, t0 + 51 * 60_000)).not.toBe(a);
  });
  it("reads config from env, repairing a pasted \\n, and is null when anything is missing", () => {
    expect(readApnsConfig({ APNS_KEY_ID: "k", APNS_TEAM_ID: "t", APNS_P8: "-----BEGIN\\nabc\\n-----END" })).toEqual({ keyId: "k", teamId: "t", p8: "-----BEGIN\nabc\n-----END" });
    expect(readApnsConfig({ APNS_KEY_ID: "k", APNS_TEAM_ID: "t" })).toBeNull();
    expect(readApnsConfig({})).toBeNull();
  });
});

describe("one push — headers and body", () => {
  it("carries topic, alert type, priority, a 30-minute expiry, the collapse id, and the app's source + time beside aps", () => {
    const now = Date.parse("2026-09-23T09:00:00Z");
    const h = apnsHeaders(TOKEN, "JWT", payload, now);
    expect(h[":path"]).toBe(`/3/device/${TOKEN}`);
    expect(h["apns-topic"]).toBe("dev.gawk.ios");
    expect(h["apns-push-type"]).toBe("alert");
    expect(h["apns-priority"]).toBe("10");
    expect(Number(h["apns-expiration"])).toBe(Math.floor(now / 1000) + 1800);
    expect(h["apns-collapse-id"]).toBe("tool-alert-Claude Code");
    expect(h.authorization).toBe("bearer JWT");
    const body = JSON.parse(apnsBody(payload));
    expect(body.aps.alert).toEqual({ title: payload.title, body: payload.body });
    expect(body).toMatchObject({ source: "Anthropic Status", generatedAt: "2026-09-23T09:00:00Z", toolId: "claude-code", url: "https://gawk.dev" });
  });
  it("returns the status and Apple's reason", async () => {
    const s = fakeSession(() => ({ status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) }));
    expect(await sendOnSession(s, apnsHeaders(TOKEN, "J", payload), apnsBody(payload))).toEqual({ status: 400, reason: "BadDeviceToken" });
  });
  it("times out a stalled stream instead of holding the function open", async () => {
    const s = fakeSession(() => ({ status: 0, hang: true }));
    await expect(sendOnSession(s, apnsHeaders(TOKEN, "J", payload), apnsBody(payload), 20)).rejects.toThrow("apns_timeout");
  });
});

describe("broadcast — targeting, cleanup, session lifecycle", () => {
  const rec = (token: string, env: ApnsRecord["env"], tools: ApnsRecord["tools"] = null): ApnsRecord => ({ token, env, tools, addedAt: "t" });
  it("unconfigured = zeros and no Redis read", async () => {
    const records = vi.fn(async () => []);
    expect(await broadcastApns(payload, { config: null, records })).toEqual({ sent: 0, failed: 0, removed: 0, skipped: 0, envs: [] });
    expect(records).not.toHaveBeenCalled();
  });
  it("sends per environment on ONE session each, skips tokens scoped to other tools, deletes dead tokens, keeps transient failures", async () => {
    const dead = "d".repeat(64), gone = "e".repeat(64), flaky = "f".repeat(64), other = "0".repeat(64);
    const sessions: Record<string, ReturnType<typeof fakeSession>> = {};
    const connect = (host: string) => {
      const s = fakeSession((h) => {
        const t = h[":path"].split("/").pop()!;
        if (t === dead) return { status: 400, body: '{"reason":"BadDeviceToken"}' };
        if (t === gone) return { status: 410, body: '{"reason":"Unregistered"}' };
        if (t === flaky) return { status: 500, body: '{"reason":"InternalServerError"}' };
        return { status: 200 };
      });
      sessions[host] = s;
      return s;
    };
    const remove = vi.fn(async (_token: string, _env: ApnsRecord["env"]) => 1);
    const records = async (env: ApnsRecord["env"]) =>
      env === "sandbox" ? [rec(TOKEN, "sandbox")] : [rec(dead, "production"), rec(gone, "production"), rec(flaky, "production"), rec(other, "production", ["cursor"])];
    const r = await broadcastApns(payload, { config: cfg, connect, records, remove });
    expect(r).toEqual({ sent: 1, failed: 3, removed: 2, skipped: 1, envs: ["sandbox", "production"] });
    expect(Object.keys(sessions).sort()).toEqual([APNS_HOSTS.production, APNS_HOSTS.sandbox].sort());
    expect(sessions[APNS_HOSTS.production].requests).toHaveLength(3);
    expect(sessions[APNS_HOSTS.production].closed).toBe(true);
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual([dead, gone].sort());
  });
  it("a transport failure is a transient failure: counted, nothing removed, session closed", async () => {
    // A dead session never answers: the per-request timeout turns it into a rejection.
    const s = fakeSession(() => ({ status: 0, hang: true }));
    const remove = vi.fn(async () => 1);
    const r = await broadcastApns(payload, { config: cfg, connect: () => s, records: async (env) => (env === "sandbox" ? [rec(TOKEN, "sandbox")] : []), remove, timeoutMs: 20 });
    expect(r).toMatchObject({ sent: 0, failed: 1, removed: 0 });
    expect(remove).not.toHaveBeenCalled();
    expect(s.closed).toBe(true);
  });
  it("an environment with no tokens opens no session", async () => {
    const connect = vi.fn((host: string) => fakeSession(() => ({ status: 200 })));
    await broadcastApns(payload, { config: cfg, connect, records: async () => [] });
    expect(connect).not.toHaveBeenCalled();
  });
  it("isDeadToken is exactly the two Apple-final outcomes", () => {
    expect(isDeadToken({ status: 410, reason: "Unregistered" })).toBe(true);
    expect(isDeadToken({ status: 400, reason: "BadDeviceToken" })).toBe(true);
    expect(isDeadToken({ status: 400, reason: "BadCollapseId" })).toBe(false);
    expect(isDeadToken({ status: 500, reason: null })).toBe(false);
  });
  it("sendApnsToOne reports unconfigured rather than throwing", async () => {
    expect(await sendApnsToOne(TOKEN, "sandbox", payload, { config: null })).toEqual({ status: 0, reason: "unconfigured" });
    const s = fakeSession(() => ({ status: 200 }));
    expect(await sendApnsToOne(TOKEN, "production", payload, { config: cfg, connect: () => s })).toEqual({ status: 200, reason: null });
    expect(s.closed).toBe(true);
  });
});
