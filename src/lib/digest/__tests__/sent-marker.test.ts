import { describe, expect, it, vi } from "vitest";
import {
  readSentMarker,
  sentMarkerKey,
  writeSentMarker,
  type SentMarkerClient,
} from "@/lib/digest/sent-marker";
import type { SentMarker } from "@/lib/digest/send-orchestrator";

const MARKER: SentMarker = {
  sentAt: "2026-05-04T08:00:00.000Z",
  recipientCount: 3,
  deliveredCount: 3,
  subject: "Gawk — 2026-05-04 · 1 tool incident",
};

function fakeClient(initial?: Record<string, string>): SentMarkerClient & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    store,
    get: (async (key: string) => store.get(key) ?? null) as SentMarkerClient["get"],
    set: (async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }) as SentMarkerClient["set"],
    del: (async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n += 1;
      return n;
    }) as SentMarkerClient["del"],
  };
}

describe("sentMarkerKey", () => {
  it("namespaces the key under digest:sent:", () => {
    expect(sentMarkerKey("2026-05-04")).toBe("digest:sent:2026-05-04");
  });
});

describe("writeSentMarker → readSentMarker round-trip", () => {
  it("writes and reads back the marker payload verbatim", async () => {
    const client = fakeClient();
    await writeSentMarker("2026-05-04", MARKER, { client });
    const got = await readSentMarker("2026-05-04", { client });
    expect(got).toEqual(MARKER);
  });

  it("scopes by date — different dates do not collide", async () => {
    const client = fakeClient();
    await writeSentMarker("2026-05-04", MARKER, { client });
    expect(await readSentMarker("2026-05-05", { client })).toBeNull();
  });

  it("setex with 30-day TTL is requested on write", async () => {
    const set = vi.fn(async () => "OK");
    const client = fakeClient();
    client.set = set as unknown as SentMarkerClient["set"];
    await writeSentMarker("2026-05-04", MARKER, { client });
    expect(set).toHaveBeenCalledTimes(1);
    const [, , opts] = set.mock.calls[0] as unknown as [unknown, unknown, unknown];
    expect(opts).toEqual({ ex: 30 * 24 * 60 * 60 });
  });
});

describe("readSentMarker — missing + malformed", () => {
  it("returns null when the key is absent", async () => {
    const client = fakeClient();
    expect(await readSentMarker("2026-05-04", { client })).toBeNull();
  });

  it("returns null when the stored value is not parseable JSON", async () => {
    const client = fakeClient({ "digest:sent:2026-05-04": "not-json{" });
    expect(await readSentMarker("2026-05-04", { client })).toBeNull();
  });

  it("returns null when the stored value is missing required fields", async () => {
    const client = fakeClient({
      "digest:sent:2026-05-04": JSON.stringify({ sentAt: "x" }),
    });
    expect(await readSentMarker("2026-05-04", { client })).toBeNull();
  });
});

describe("read/write — failure modes (graceful, never throw)", () => {
  it("returns null when the read throws (Redis outage)", async () => {
    const client = {
      get: async () => {
        throw new Error("redis down");
      },
      set: async () => "OK",
      del: async () => 0,
    } as unknown as SentMarkerClient;
    await expect(
      readSentMarker("2026-05-04", { client }),
    ).resolves.toBeNull();
  });

  it("swallows write failures (must not break the send pipeline that just succeeded)", async () => {
    const client = {
      get: async () => null,
      set: async () => {
        throw new Error("redis down");
      },
      del: async () => 0,
    } as unknown as SentMarkerClient;
    await expect(
      writeSentMarker("2026-05-04", MARKER, { client }),
    ).resolves.toBeUndefined();
  });
});
