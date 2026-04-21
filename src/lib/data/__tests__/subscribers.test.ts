import { describe, expect, it } from "vitest";
import { hashEmail, mintToken } from "@/lib/email/hash";
import {
  confirmTokenKey,
  countSubscribers,
  deleteSubscriber,
  findByConfirmToken,
  findByUnsubToken,
  indexConfirmToken,
  indexUnsubToken,
  readConfirmedSubscribersWithEmail,
  readSubscriber,
  subscriberKey,
  type SubscriberClient,
  type SubscriberRecord,
  unsubTokenKey,
  updateSubscriberStatus,
  writeSubscriber,
} from "@/lib/data/subscribers";
import { MockRedis } from "@/lib/data/__tests__/helpers/mock-redis";

const SECRET = "test-secret";

function newClient(): SubscriberClient {
  return new MockRedis() as unknown as SubscriberClient;
}

function baseRecord(emailHash: string): SubscriberRecord {
  return {
    emailHash,
    status: "pending",
    geo: { country: "DE", region: null, covered: true },
    consentCategories: { necessary: true, analytics: true, marketing: false },
    createdAt: "2026-04-21T10:00:00.000Z",
    unsubToken: "unsub-raw",
    confirmToken: "confirm-raw",
  };
}

describe("subscriberKey / confirmTokenKey / unsubTokenKey", () => {
  it("subscriberKey prefixes the hash", () => {
    expect(subscriberKey("abc")).toBe("sub:abc");
  });

  it("confirmTokenKey + unsubTokenKey hash the token (never store raw)", () => {
    const t = mintToken({ kind: "confirm", emailHash: "h" }, SECRET);
    const ck = confirmTokenKey(t);
    const uk = unsubTokenKey(t);
    expect(ck).toMatch(/^sub:confirmToken:[0-9a-f]{64}$/);
    expect(uk).toMatch(/^sub:unsubToken:[0-9a-f]{64}$/);
    expect(ck).not.toContain(t);
    expect(uk).not.toContain(t);
  });
});

describe("writeSubscriber / readSubscriber round-trip", () => {
  it("writes and reads back a full record", async () => {
    const client = newClient();
    const hash = hashEmail("a@x.com");
    const record = baseRecord(hash);
    await writeSubscriber(record, { client });
    const read = await readSubscriber(hash, { client });
    expect(read).toEqual(record);
  });

  it("returns null for a missing hash", async () => {
    const client = newClient();
    expect(await readSubscriber("nope", { client })).toBeNull();
  });

  it("indexes the hash so countSubscribers sees it", async () => {
    const client = newClient();
    await writeSubscriber(baseRecord(hashEmail("a@x.com")), { client });
    await writeSubscriber(baseRecord(hashEmail("b@x.com")), { client });
    expect(await countSubscribers({ client })).toBe(2);
  });

  it("fail-softs when no client is available", async () => {
    expect(await readSubscriber("h", {})).toBeNull();
    expect(await countSubscribers({})).toBe(0);
    await expect(writeSubscriber(baseRecord("h"), {})).resolves.toBeUndefined();
  });
});

describe("updateSubscriberStatus", () => {
  it("flips pending → confirmed + clears confirmToken", async () => {
    const client = newClient();
    const hash = hashEmail("a@x.com");
    await writeSubscriber(baseRecord(hash), { client });
    const next = await updateSubscriberStatus(
      hash,
      { status: "confirmed", confirmedAt: "2026-04-21T10:05:00.000Z", confirmToken: undefined },
      { client },
    );
    expect(next?.status).toBe("confirmed");
    expect(next?.confirmedAt).toBe("2026-04-21T10:05:00.000Z");
    expect(next?.confirmToken).toBeUndefined();
    expect((await readSubscriber(hash, { client }))?.confirmToken).toBeUndefined();
  });

  it("flips confirmed → unsubscribed", async () => {
    const client = newClient();
    const hash = hashEmail("a@x.com");
    await writeSubscriber(
      { ...baseRecord(hash), status: "confirmed" },
      { client },
    );
    const next = await updateSubscriberStatus(
      hash,
      { status: "unsubscribed", unsubscribedAt: "2026-04-22T09:00:00.000Z" },
      { client },
    );
    expect(next?.status).toBe("unsubscribed");
    expect(next?.unsubscribedAt).toBe("2026-04-22T09:00:00.000Z");
  });

  it("returns null if the record is missing (no synthesised ghost)", async () => {
    const client = newClient();
    expect(
      await updateSubscriberStatus("ghost", { status: "confirmed" }, { client }),
    ).toBeNull();
  });
});

describe("token indexing + reverse lookup", () => {
  it("indexes confirm token + looks up the subscriber by token", async () => {
    const client = newClient();
    const hash = hashEmail("a@x.com");
    const token = mintToken({ kind: "confirm", emailHash: hash }, SECRET);
    await writeSubscriber(baseRecord(hash), { client });
    await indexConfirmToken(token, hash, 3600, { client });

    const found = await findByConfirmToken(token, { client });
    expect(found?.emailHash).toBe(hash);
  });

  it("confirm token expires via the client TTL (mocked)", async () => {
    let now = 1_700_000_000_000;
    const clock = () => now;
    const client = new MockRedis(clock) as unknown as SubscriberClient;
    const hash = hashEmail("a@x.com");
    const token = "t-1";
    await writeSubscriber(baseRecord(hash), { client });
    await indexConfirmToken(token, hash, 60, { client });
    expect((await findByConfirmToken(token, { client }))?.emailHash).toBe(hash);
    now += 61 * 1000;
    expect(await findByConfirmToken(token, { client })).toBeNull();
  });

  it("indexes unsub token without expiry", async () => {
    const client = newClient();
    const hash = hashEmail("a@x.com");
    const token = "u-1";
    await writeSubscriber(baseRecord(hash), { client });
    await indexUnsubToken(token, hash, { client });
    expect((await findByUnsubToken(token, { client }))?.emailHash).toBe(hash);
  });

  it("findByConfirmToken returns null if the subscriber is gone", async () => {
    const client = newClient();
    const hash = hashEmail("a@x.com");
    await indexConfirmToken("t-2", hash, 3600, { client });
    // subscriber never written → lookup still resolves hash, but the
    // record read returns null because the row doesn't exist.
    expect(await findByConfirmToken("t-2", { client })).toBeNull();
  });
});

describe("deleteSubscriber", () => {
  it("removes the sub:{hash} row", async () => {
    const client = newClient();
    const hash = hashEmail("a@x.com");
    await writeSubscriber(baseRecord(hash), { client });
    await deleteSubscriber(hash, { client });
    expect(await readSubscriber(hash, { client })).toBeNull();
  });
});

describe("encryptedEmail lifecycle", () => {
  it("round-trips encryptedEmail through write+read", async () => {
    const client = newClient();
    const hash = hashEmail("a@x.com");
    await writeSubscriber(
      { ...baseRecord(hash), encryptedEmail: "ZW5jcnlwdGVkLWNpcGhlcnRleHQ=" },
      { client },
    );
    const out = await readSubscriber(hash, { client });
    expect(out?.encryptedEmail).toBe("ZW5jcnlwdGVkLWNpcGhlcnRleHQ=");
  });

  it("updateSubscriberStatus can clear encryptedEmail to null", async () => {
    const client = newClient();
    const hash = hashEmail("a@x.com");
    await writeSubscriber(
      {
        ...baseRecord(hash),
        status: "confirmed",
        encryptedEmail: "abc",
      },
      { client },
    );
    const next = await updateSubscriberStatus(
      hash,
      { status: "unsubscribed", encryptedEmail: null },
      { client },
    );
    expect(next?.status).toBe("unsubscribed");
    expect(next?.encryptedEmail).toBeNull();
  });
});

describe("readConfirmedSubscribersWithEmail", () => {
  const fakeDecrypt = (ct: string) => `plain:${ct}`;

  it("returns only confirmed subscribers with encryptedEmail set", async () => {
    const client = newClient();
    const confirmedWithEmail = hashEmail("a@x.com");
    const confirmedNoEmail = hashEmail("b@x.com");
    const pending = hashEmail("c@x.com");
    const unsubscribed = hashEmail("d@x.com");
    await writeSubscriber(
      { ...baseRecord(confirmedWithEmail), status: "confirmed", encryptedEmail: "ct-a" },
      { client },
    );
    await writeSubscriber(
      { ...baseRecord(confirmedNoEmail), status: "confirmed" },
      { client },
    );
    await writeSubscriber(
      { ...baseRecord(pending), status: "pending", encryptedEmail: "ct-c" },
      { client },
    );
    await writeSubscriber(
      {
        ...baseRecord(unsubscribed),
        status: "unsubscribed",
        encryptedEmail: null,
      },
      { client },
    );
    const list = await readConfirmedSubscribersWithEmail({
      client,
      decrypt: fakeDecrypt,
    });
    expect(list).toHaveLength(1);
    expect(list[0].emailHash).toBe(confirmedWithEmail);
    expect(list[0].email).toBe("plain:ct-a");
  });

  it("skips records whose ciphertext fails to decrypt", async () => {
    const client = newClient();
    const hash = hashEmail("a@x.com");
    await writeSubscriber(
      { ...baseRecord(hash), status: "confirmed", encryptedEmail: "bad-ct" },
      { client },
    );
    const list = await readConfirmedSubscribersWithEmail({
      client,
      decrypt: () => {
        throw new Error("tamper");
      },
    });
    expect(list).toHaveLength(0);
  });

  it("returns [] when client is unavailable", async () => {
    const list = await readConfirmedSubscribersWithEmail({
      decrypt: fakeDecrypt,
    });
    expect(list).toEqual([]);
  });
});

describe("parse guardrails", () => {
  it("readSubscriber returns null on malformed JSON in the row", async () => {
    const client = newClient();
    await client.set(subscriberKey("h"), "not json");
    expect(await readSubscriber("h", { client })).toBeNull();
  });

  it("readSubscriber returns null on object missing required fields", async () => {
    const client = newClient();
    await client.set(subscriberKey("h"), JSON.stringify({ not: "a record" }));
    expect(await readSubscriber("h", { client })).toBeNull();
  });
});
