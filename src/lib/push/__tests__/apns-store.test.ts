/**
 * APNs token records without Redis: what is accepted, what one hash field
 * holds, and that a malformed field is skipped rather than crashing a
 * broadcast.
 */
import { describe, expect, it, vi } from "vitest";

import {
  fromStoredValue,
  getApnsRecords,
  hashKey,
  isApnsEnv,
  isApnsToken,
  removeApnsToken,
  saveApnsToken,
  toStoredValue,
} from "@/lib/push/apns-store";

const TOKEN = "a".repeat(64);
const at = new Date("2026-09-23T09:00:00Z");

describe("validation — the app cannot register garbage", () => {
  it("accepts exactly 64 lowercase hex characters", () => {
    expect(isApnsToken(TOKEN)).toBe(true);
    expect(isApnsToken("A".repeat(64))).toBe(false);
    expect(isApnsToken("a".repeat(63))).toBe(false);
    expect(isApnsToken(42)).toBe(false);
  });
  it("accepts only the two APNs environments", () => {
    expect(isApnsEnv("sandbox")).toBe(true);
    expect(isApnsEnv("production")).toBe(true);
    expect(isApnsEnv("prod")).toBe(false);
    expect(isApnsEnv(undefined)).toBe(false);
  });
  it("keys one hash per environment", () => {
    expect(hashKey("sandbox")).toBe("apns:tokens:sandbox");
    expect(hashKey("production")).toBe("apns:tokens:production");
  });
});

describe("stored value — the stack rides on the field like the web record", () => {
  it("writes known tools in order, null when there is no stack", () => {
    expect(JSON.parse(toStoredValue(["cursor", "claude-code"], at))).toEqual({ tools: ["cursor", "claude-code"], addedAt: "2026-09-23T09:00:00.000Z" });
    expect(JSON.parse(toStoredValue(null, at)).tools).toBeNull();
    expect(JSON.parse(toStoredValue([], at)).tools).toBeNull();
  });
  it("reads back a record, dropping unknown tool ids", () => {
    const r = fromStoredValue(TOKEN, "production", JSON.stringify({ tools: ["cursor", "not-a-tool"], addedAt: "x" }));
    expect(r).toEqual({ token: TOKEN, env: "production", tools: ["cursor"], addedAt: "x" });
  });
  it("skips a malformed field or a bad token instead of throwing", () => {
    expect(fromStoredValue(TOKEN, "sandbox", "{not json")).toBeNull();
    expect(fromStoredValue("nope", "sandbox", "{}")).toBeNull();
    expect(fromStoredValue(TOKEN, "sandbox", 7)).toBeNull();
  });
});

describe("Redis commands — one per operation", () => {
  const redis = { hset: vi.fn(async () => 1), hdel: vi.fn(async () => 1), hgetall: vi.fn(async () => ({ [TOKEN]: JSON.stringify({ tools: null, addedAt: "t" }), bad: "{" })) };
  it("save = one HSET on the env's hash", async () => {
    await saveApnsToken(TOKEN, "sandbox", ["cursor"], redis);
    expect(redis.hset).toHaveBeenCalledTimes(1);
    expect(redis.hset).toHaveBeenCalledWith("apns:tokens:sandbox", { [TOKEN]: expect.stringContaining('"tools":["cursor"]') });
  });
  it("remove = one HDEL", async () => {
    await removeApnsToken(TOKEN, "production", redis);
    expect(redis.hdel).toHaveBeenCalledWith("apns:tokens:production", TOKEN);
  });
  it("read = one HGETALL, malformed fields dropped", async () => {
    const rows = await getApnsRecords("production", redis);
    expect(redis.hgetall).toHaveBeenCalledTimes(1);
    expect(rows.map((r) => r.token)).toEqual([TOKEN]);
  });
  it("no Redis = no-op with an honest error", async () => {
    expect(await saveApnsToken(TOKEN, "sandbox", null, null)).toEqual({ ok: false, error: "redis_unavailable" });
    expect(await getApnsRecords("sandbox", null)).toEqual([]);
  });
});
