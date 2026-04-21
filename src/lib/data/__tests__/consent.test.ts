import { describe, expect, it } from "vitest";
import {
  auditKey,
  consentKey,
  deleteConsent,
  listAudit,
  readConsent,
  writeConsent,
  type ConsentClient,
  type ConsentState,
} from "@/lib/data/consent";
import { MockRedis } from "@/lib/data/__tests__/helpers/mock-redis";

function newClient(): ConsentClient {
  return new MockRedis() as unknown as ConsentClient;
}

function state(overrides: Partial<ConsentState> = {}): ConsentState {
  return {
    visitorId: "v-1",
    categories: { necessary: true, analytics: false, marketing: false },
    updatedAt: "2026-04-21T10:00:00.000Z",
    geo: { country: "DE", region: null, covered: true },
    ...overrides,
  };
}

describe("consentKey / auditKey", () => {
  it("consentKey prefixes the visitor id", () => {
    expect(consentKey("v-42")).toBe("consent:v-42");
  });

  it("auditKey buckets by UTC year-month", () => {
    expect(auditKey(new Date("2026-04-21T23:59:00Z"))).toBe("consent:audit:2026-04");
    expect(auditKey(new Date("2026-01-01T00:00:00Z"))).toBe("consent:audit:2026-01");
    expect(auditKey(new Date("2026-12-01T00:00:00Z"))).toBe("consent:audit:2026-12");
  });
});

describe("writeConsent + readConsent round-trip", () => {
  it("writes then reads a state row", async () => {
    const client = newClient();
    const s = state({
      categories: { necessary: true, analytics: true, marketing: false },
    });
    await writeConsent(s, "grant", { client });
    const read = await readConsent("v-1", { client });
    expect(read).toEqual(s);
  });

  it("overwrites on subsequent writes", async () => {
    const client = newClient();
    await writeConsent(state(), "grant", { client });
    await writeConsent(
      state({
        categories: { necessary: true, analytics: true, marketing: true },
        updatedAt: "2026-04-22T10:00:00.000Z",
      }),
      "update",
      { client },
    );
    const read = await readConsent("v-1", { client });
    expect(read?.categories.marketing).toBe(true);
    expect(read?.updatedAt).toBe("2026-04-22T10:00:00.000Z");
  });

  it("returns null for a visitor that has never been written", async () => {
    const client = newClient();
    expect(await readConsent("ghost", { client })).toBeNull();
  });

  it("fail-softs when Redis is not configured", async () => {
    expect(await readConsent("v-1", {})).toBeNull();
    await expect(writeConsent(state(), "grant", {})).resolves.toBeUndefined();
  });
});

describe("audit log", () => {
  it("appends to the month bucket on every write", async () => {
    const client = newClient();
    const now = new Date("2026-04-21T10:00:00Z");
    await writeConsent(state(), "grant", { client, now });
    await writeConsent(
      state({
        categories: { necessary: true, analytics: true, marketing: false },
      }),
      "update",
      { client, now },
    );
    const entries = await listAudit(now, 10, { client });
    expect(entries).toHaveLength(2);
    expect(entries[0].action).toBe("update"); // LPUSH → newest first
    expect(entries[1].action).toBe("grant");
  });

  it("writes a delete tombstone with zeroed categories + retained visitorId", async () => {
    const client = newClient();
    const now = new Date("2026-04-21T10:00:00Z");
    await writeConsent(
      state({
        categories: { necessary: true, analytics: true, marketing: true },
      }),
      "grant",
      { client, now },
    );
    await deleteConsent("v-1", state().geo, { client, now });
    expect(await readConsent("v-1", { client })).toBeNull();
    const entries = await listAudit(now, 10, { client });
    const tombstone = entries.find((e) => e.action === "delete");
    expect(tombstone).toBeDefined();
    expect(tombstone?.visitorId).toBe("v-1");
    expect(tombstone?.categories).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });

  it("listAudit returns [] for a month with no events", async () => {
    const client = newClient();
    expect(await listAudit(new Date("2026-05-01Z"), 10, { client })).toEqual([]);
  });

  it("listAudit skips malformed entries without throwing", async () => {
    const client = newClient();
    const now = new Date("2026-04-21T10:00:00Z");
    const key = auditKey(now);
    await client.lpush(key, "not json");
    await client.lpush(key, JSON.stringify({ missing: "fields" }));
    await writeConsent(state(), "grant", { client, now });
    const entries = await listAudit(now, 10, { client });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("grant");
  });
});

describe("parse guardrails", () => {
  it("readConsent returns null on malformed JSON", async () => {
    const client = newClient();
    await client.set(consentKey("v-1"), "not json");
    expect(await readConsent("v-1", { client })).toBeNull();
  });

  it("readConsent returns null on object missing required fields", async () => {
    const client = newClient();
    await client.set(consentKey("v-1"), JSON.stringify({ visitorId: "v-1" }));
    expect(await readConsent("v-1", { client })).toBeNull();
  });
});
