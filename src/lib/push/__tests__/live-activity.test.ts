/**
 * The tool-outage Live Activity rail: what gawk.dev sends to start an activity on a status flip
 * and to end it on recovery. The content-state keys are a contract with the iOS app
 * (gawk-ios ToolOutageActivityTests pins the same JSON) — a key spelled differently is an
 * activity that silently never renders.
 */
import { describe, expect, it, vi } from "vitest";
import {
  LA_TOPIC,
  endLiveActivities,
  endPayload,
  laHeaders,
  startLiveActivities,
  startPayload,
  statusWord,
} from "@/lib/push/live-activity";
import type { AlertTransition, RecoveryTransition } from "@/lib/notify/tool-alert-transitions";
import type { ApnsSession, ApnsStream } from "@/lib/push/apns";
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const cfg = { keyId: "7ZW27RXZSD", teamId: "6C4U4QF7DL", p8: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
const NOW = Date.parse("2026-09-10T08:00:00Z");

const alert: AlertTransition = {
  kind: "alert",
  primaryKey: "openai-status:openai-api",
  card: {
    id: "x", type: "TOOL_ALERT", severity: 100,
    headline: "OpenAI API is reporting degraded performance",
    detail: "Upstream status page reports degraded.",
    sourceName: "OpenAI Status", sourceUrl: "https://status.openai.com",
    timestamp: "2026-09-10T02:21:57Z",
    meta: { toolId: "openai-api", status: "degraded", incidentName: "Unable to open shared ChatGPT Project using direct link" },
  } as AlertTransition["card"],
};
const recovery: RecoveryTransition = {
  kind: "recovery",
  primaryKey: "openai-status:openai-api",
  state: { status: "degraded", alertedAt: "2026-09-10T02:21:57Z", sourceUrl: "https://status.openai.com",
           sourceName: "OpenAI Status", toolDisplayName: "OpenAI API", toolId: "openai-api" } as RecoveryTransition["state"],
};

function fakeSession(status = 200): ApnsSession & { requests: Record<string, string>[]; bodies: string[] } {
  const s = { requests: [] as Record<string, string>[], bodies: [] as string[], close() {}, request(h: Record<string, string>): ApnsStream {
    s.requests.push(h);
    const hs: Record<string, ((...a: unknown[]) => void)[]> = {};
    const st: ApnsStream = { on(ev, fn) { (hs[ev] ??= []).push(fn as (...a: unknown[]) => void); return st; },
      end(body: string) { s.bodies.push(body); queueMicrotask(() => { hs.response?.forEach((f) => f({ ":status": status })); hs.end?.forEach((f) => f()); }); } };
    return st;
  } };
  return s;
}

describe("content-state — the contract with the app", () => {
  it("start: attributes + content-state keys exactly as ToolOutageState decodes them, times in epoch seconds", () => {
    const p = startPayload(alert, NOW) as { aps: Record<string, unknown> };
    expect(p.aps.event).toBe("start");
    expect(p.aps["attributes-type"]).toBe("ToolOutageAttributes");
    expect(p.aps.attributes).toEqual({ toolId: "openai-api", toolName: "OpenAI API" });
    expect(p.aps["content-state"]).toEqual({
      status: "degraded",
      incident: "Unable to open shared ChatGPT Project using direct link",
      since: 1789006917,
      source: "OpenAI Status",
      checkedAt: 1789027200,
    });
    // push-to-start requires an alert; it carries the source like every gawk push
    expect((p.aps.alert as { body: string }).body).toContain("OpenAI Status");
    expect(p.aps.timestamp).toBe(1789027200);
  });
  it("no incident name → incident is null, never the generic 'status page reports' sentence", () => {
    const a = { ...alert, card: { ...alert.card, meta: { toolId: "openai-api", status: "degraded" } } } as AlertTransition;
    expect((startPayload(a, NOW) as { aps: { "content-state": { incident: unknown } } }).aps["content-state"].incident).toBeNull();
  });
  it("the vendor's own status word, underscores spoken", () => {
    expect(statusWord("major_outage")).toBe("major outage");
    expect(statusWord("degraded")).toBe("degraded");
  });
  it("end: event end, a final operational state, dismissed 15 minutes later", () => {
    const p = endPayload(recovery, NOW) as { aps: Record<string, unknown> };
    expect(p.aps.event).toBe("end");
    expect(p.aps["dismissal-date"]).toBe(1789027200 + 15 * 60);
    expect(p.aps["content-state"]).toEqual({ status: "operational", incident: null, since: 1789006917, source: "OpenAI Status", checkedAt: 1789027200 });
  });
});

describe("headers — Apple's Live Activity push", () => {
  it("push-type liveactivity on the .push-type.liveactivity topic", () => {
    const h = laHeaders("a".repeat(64), "jwt", NOW);
    expect(h["apns-push-type"]).toBe("liveactivity");
    expect(h["apns-topic"]).toBe(LA_TOPIC);
    expect(LA_TOPIC).toBe("dev.gawk.ios.push-type.liveactivity");
    expect(h[":path"]).toBe(`/3/device/${"a".repeat(64)}`);
  });
});

describe("start and end — targeting and token lifecycle", () => {
  it("unconfigured = no sends and no Redis reads", async () => {
    const startRecords = vi.fn(async () => []);
    expect(await startLiveActivities(alert, { config: null, startRecords })).toMatchObject({ sent: 0 });
    expect(startRecords).not.toHaveBeenCalled();
  });
  it("start goes only to start tokens whose stack includes the tool (or that have no stack)", async () => {
    const s = fakeSession();
    const mine = "1".repeat(64), other = "2".repeat(64), all = "3".repeat(64);
    const r = await startLiveActivities(alert, {
      config: cfg, nowMs: NOW, connect: () => s,
      startRecords: async (env) => (env === "sandbox" ? [
        { token: mine, env, tools: ["openai-api"], addedAt: "t" },
        { token: other, env, tools: ["cursor"], addedAt: "t" },
        { token: all, env, tools: null, addedAt: "t" }] : []),
    });
    expect(r).toMatchObject({ sent: 2, skipped: 1 });
    expect(s.requests.map((h) => h[":path"].split("/").pop()).sort()).toEqual([all, mine].sort());
    expect(JSON.parse(s.bodies[0]).aps.event).toBe("start");
  });
  it("end goes to the activity tokens for that tool, then forgets them", async () => {
    const s = fakeSession();
    const removeActivity = vi.fn(async () => 1);
    const r = await endLiveActivities(recovery, {
      config: cfg, nowMs: NOW, connect: () => s, removeActivity,
      activityRecords: async (env) => (env === "sandbox" ? [
        { token: "4".repeat(64), env, toolId: "openai-api", addedAt: "t" },
        { token: "5".repeat(64), env, toolId: "cursor", addedAt: "t" }] : []),
    });
    expect(r).toMatchObject({ sent: 1 });
    expect(s.requests).toHaveLength(1);
    expect(removeActivity).toHaveBeenCalledWith("4".repeat(64), "sandbox");
  });
});
