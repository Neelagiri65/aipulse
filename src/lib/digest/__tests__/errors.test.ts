import { describe, expect, it } from "vitest";
import {
  appendDigestError,
  errorsKey,
  readDigestErrors,
  type DigestErrorEntry,
  type DigestErrorsClient,
} from "@/lib/digest/errors";
import { MockRedis } from "@/lib/data/__tests__/helpers/mock-redis";

function newClient(): DigestErrorsClient {
  return new MockRedis() as unknown as DigestErrorsClient;
}

function entry(overrides: Partial<DigestErrorEntry> = {}): DigestErrorEntry {
  return {
    at: "2026-04-22T08:00:00.000Z",
    kind: "batch-4xx",
    subject: "AI Pulse — 2026-04-22",
    message: "address rejected",
    ...overrides,
  };
}

describe("errorsKey", () => {
  it("prefixes the date with digest:errors:", () => {
    expect(errorsKey("2026-04-22")).toBe("digest:errors:2026-04-22");
  });
});

describe("appendDigestError + readDigestErrors round-trip", () => {
  it("writes a single entry and reads it back", async () => {
    const client = newClient();
    const e = entry({ hash: "h1" });
    await appendDigestError("2026-04-22", e, { client });
    const out = await readDigestErrors("2026-04-22", 50, { client });
    expect(out).toEqual([e]);
  });

  it("returns entries in LIFO order (most recent first)", async () => {
    const client = newClient();
    await appendDigestError("2026-04-22", entry({ message: "first" }), { client });
    await appendDigestError("2026-04-22", entry({ message: "second" }), { client });
    await appendDigestError("2026-04-22", entry({ message: "third" }), { client });
    const out = await readDigestErrors("2026-04-22", 50, { client });
    expect(out.map((e) => e.message)).toEqual(["third", "second", "first"]);
  });

  it("respects the limit parameter", async () => {
    const client = newClient();
    for (let i = 0; i < 10; i++) {
      await appendDigestError("2026-04-22", entry({ message: `m${i}` }), {
        client,
      });
    }
    const out = await readDigestErrors("2026-04-22", 3, { client });
    expect(out).toHaveLength(3);
  });

  it("returns [] for a date with no entries", async () => {
    const client = newClient();
    const out = await readDigestErrors("2099-01-01", 50, { client });
    expect(out).toEqual([]);
  });
});

describe("readDigestErrors — parse guardrails", () => {
  it("skips non-JSON values", async () => {
    const client = newClient();
    await (client as unknown as MockRedis).lpush(
      errorsKey("2026-04-22"),
      "not-json",
    );
    await appendDigestError("2026-04-22", entry({ message: "ok" }), { client });
    const out = await readDigestErrors("2026-04-22", 50, { client });
    expect(out.map((e) => e.message)).toEqual(["ok"]);
  });

  it("skips JSON missing required fields", async () => {
    const client = newClient();
    await (client as unknown as MockRedis).lpush(
      errorsKey("2026-04-22"),
      JSON.stringify({ at: "x" }),
    );
    await appendDigestError("2026-04-22", entry({ message: "ok" }), { client });
    const out = await readDigestErrors("2026-04-22", 50, { client });
    expect(out).toHaveLength(1);
    expect(out[0].message).toBe("ok");
  });
});

describe("fail-soft", () => {
  it("appendDigestError never throws on Redis errors", async () => {
    const throwing: DigestErrorsClient = {
      lpush: (async () => {
        throw new Error("boom");
      }) as DigestErrorsClient["lpush"],
      lrange: (async () => {
        throw new Error("boom");
      }) as DigestErrorsClient["lrange"],
    };
    await expect(
      appendDigestError("2026-04-22", entry(), { client: throwing }),
    ).resolves.toBeUndefined();
  });

  it("readDigestErrors returns [] on Redis errors", async () => {
    const throwing: DigestErrorsClient = {
      lpush: (async () => {
        throw new Error("boom");
      }) as DigestErrorsClient["lpush"],
      lrange: (async () => {
        throw new Error("boom");
      }) as DigestErrorsClient["lrange"],
    };
    const out = await readDigestErrors("2026-04-22", 50, { client: throwing });
    expect(out).toEqual([]);
  });
});
