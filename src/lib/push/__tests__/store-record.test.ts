/**
 * The stored push record, without Redis: what gets written for a given
 * subscription + stack, what a legacy raw subscription reads back as, and
 * that web-push only ever sees the subscription fields.
 */
import { describe, expect, it } from "vitest";
import { fromStored, toRecord, toWebPushSubscription } from "@/lib/push/store";

const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "P", auth: "A" }, expirationTime: null };
const at = new Date("2026-09-15T12:00:00Z");

describe("toRecord — the stack rides on the record only when there is one", () => {
  it("with a stack: tools written in the visitor's order, unknown ids dropped", () => {
    expect(toRecord(sub, ["cursor", "claude-code"], at)).toEqual({
      endpoint: sub.endpoint,
      keys: sub.keys,
      expirationTime: null,
      updatedAt: "2026-09-15T12:00:00.000Z",
      tools: ["cursor", "claude-code"],
    });
    expect(toRecord(sub, ["nope" as never, "copilot"], at).tools).toEqual(["copilot"]);
  });
  it("no stack / empty stack: no tools key at all, so a rewrite clears an earlier scope", () => {
    expect("tools" in toRecord(sub, null, at)).toBe(false);
    expect("tools" in toRecord(sub, [], at)).toBe(false);
  });
});

describe("fromStored — legacy and current values", () => {
  it("a legacy raw PushSubscription string reads back as a record with no tools", () => {
    const rec = fromStored(JSON.stringify(sub));
    expect(rec).toEqual({ endpoint: sub.endpoint, keys: sub.keys, expirationTime: null });
    expect(rec && "tools" in rec).toBe(false);
  });
  it("a current record round-trips, including tools and updatedAt; junk tool ids are dropped", () => {
    const written = JSON.stringify({ ...toRecord(sub, ["copilot"], at), tools: ["copilot", "junk"] });
    expect(fromStored(written)).toEqual({ ...toRecord(sub, ["copilot"], at) });
  });
  it("accepts an already-parsed object and rejects anything without endpoint + keys", () => {
    expect(fromStored({ ...sub })).toMatchObject({ endpoint: sub.endpoint });
    expect(fromStored("not json")).toBeNull();
    expect(fromStored(null)).toBeNull();
    expect(fromStored({ endpoint: "x" })).toBeNull();
    expect(fromStored({ endpoint: "x", keys: { p256dh: "P" } })).toBeNull();
  });
});

describe("toWebPushSubscription — web-push never sees tools or updatedAt", () => {
  it("passes exactly endpoint, keys and expirationTime", () => {
    const rec = toRecord(sub, ["cursor"], at);
    expect(toWebPushSubscription(rec)).toEqual({ endpoint: sub.endpoint, keys: sub.keys, expirationTime: null });
    const noExpiry = toRecord({ endpoint: "e", keys: sub.keys }, null, at);
    expect(toWebPushSubscription(noExpiry)).toEqual({ endpoint: "e", keys: sub.keys });
  });
});
