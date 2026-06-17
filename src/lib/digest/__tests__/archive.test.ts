import { describe, expect, it } from "vitest";
import {
  digestArchiveKey,
  listDigestDates,
  readDigestBody,
  writeDigestBody,
  type DigestArchiveClient,
  type DigestArchiveScanClient,
} from "@/lib/digest/archive";
import type { DigestBody } from "@/lib/digest/types";
import { MockRedis } from "@/lib/data/__tests__/helpers/mock-redis";

function newClient(): DigestArchiveClient {
  return new MockRedis() as unknown as DigestArchiveClient;
}

function mkBody(overrides: Partial<DigestBody> = {}): DigestBody {
  return {
    date: "2026-04-22",
    subject: "Gawk — 2026-04-22 · all quiet in the AI ecosystem",
    mode: "quiet",
    greetingTemplate: "Good morning from Gawk — all quiet in {geoCountry}.",
    generatedAt: "2026-04-22T08:00:00.000Z",
    sections: [
      {
        id: "tool-health",
        title: "Tool Health",
        anchorSlug: "tool-health",
        mode: "quiet",
        headline: "All tools operational",
        items: [],
        sourceUrls: [],
      },
    ],
    ...overrides,
  };
}

describe("digestArchiveKey", () => {
  it("prefixes the date with digest:", () => {
    expect(digestArchiveKey("2026-04-22")).toBe("digest:2026-04-22");
  });
});

describe("writeDigestBody / readDigestBody round-trip", () => {
  it("writes and reads back a full DigestBody", async () => {
    const client = newClient();
    const body = mkBody();
    await writeDigestBody(body.date, body, { client });
    const out = await readDigestBody(body.date, { client });
    expect(out).toEqual(body);
  });

  it("overwrites previous body for the same date", async () => {
    const client = newClient();
    await writeDigestBody("2026-04-22", mkBody({ subject: "old" }), { client });
    await writeDigestBody("2026-04-22", mkBody({ subject: "new" }), { client });
    const out = await readDigestBody("2026-04-22", { client });
    expect(out?.subject).toBe("new");
  });
});

describe("readDigestBody — missing / malformed", () => {
  it("returns null when the key is missing", async () => {
    const client = newClient();
    const out = await readDigestBody("2099-01-01", { client });
    expect(out).toBeNull();
  });

  it("returns null when the stored value is not a DigestBody", async () => {
    const client = newClient();
    await client.set(digestArchiveKey("2026-04-22"), "not-json");
    const out = await readDigestBody("2026-04-22", { client });
    expect(out).toBeNull();
  });

  it("returns null when stored JSON is missing required fields", async () => {
    const client = newClient();
    await client.set(
      digestArchiveKey("2026-04-22"),
      JSON.stringify({ date: "2026-04-22" }),
    );
    const out = await readDigestBody("2026-04-22", { client });
    expect(out).toBeNull();
  });
});

describe("writeDigestBody — no TTL", () => {
  it("writes without an ex option (no expiry)", async () => {
    const client = newClient();
    const setSpy = new Map<string, { value: unknown; opts?: { ex?: number } }>();
    const spyClient: DigestArchiveClient = {
      get: client.get.bind(client),
      del: client.del.bind(client),
      set: (async (k: string, v: unknown, opts?: { ex?: number }) => {
        setSpy.set(k, { value: v, opts });
        return "OK";
      }) as DigestArchiveClient["set"],
    };
    await writeDigestBody("2026-04-22", mkBody(), { client: spyClient });
    const entry = setSpy.get("digest:2026-04-22");
    expect(entry).toBeDefined();
    expect(entry!.opts).toBeUndefined();
  });
});

describe("listDigestDates", () => {
  function scanClient(pages: Array<[string | number, string[]]>): DigestArchiveScanClient {
    let i = 0;
    return {
      scan: (async () => pages[Math.min(i++, pages.length - 1)]) as DigestArchiveScanClient["scan"],
    };
  }

  it("enumerates keys across paginated scans, stripping the prefix, newest first", async () => {
    const client = scanClient([
      ["7", ["digest:2026-06-10", "digest:2026-06-11"]],
      ["0", ["digest:2026-06-09"]],
    ]);
    const dates = await listDigestDates({ client });
    expect(dates).toEqual(["2026-06-11", "2026-06-10", "2026-06-09"]);
  });

  it("returns [] (fail-soft) when scan throws", async () => {
    const throwing: DigestArchiveScanClient = {
      scan: (async () => { throw new Error("boom"); }) as DigestArchiveScanClient["scan"],
    };
    expect(await listDigestDates({ client: throwing })).toEqual([]);
  });

  it("returns [] when the archive is empty", async () => {
    const dates = await listDigestDates({ client: scanClient([["0", []]]) });
    expect(dates).toEqual([]);
  });
});

describe("fail-soft behaviour", () => {
  it("writeDigestBody never throws on Redis errors", async () => {
    const throwing: DigestArchiveClient = {
      get: (async () => { throw new Error("boom"); }) as DigestArchiveClient["get"],
      set: (async () => { throw new Error("boom"); }) as DigestArchiveClient["set"],
      del: (async () => { throw new Error("boom"); }) as DigestArchiveClient["del"],
    };
    await expect(
      writeDigestBody("2026-04-22", mkBody(), { client: throwing }),
    ).resolves.toBeUndefined();
  });

  it("readDigestBody returns null on Redis errors", async () => {
    const throwing: DigestArchiveClient = {
      get: (async () => { throw new Error("boom"); }) as DigestArchiveClient["get"],
      set: (async () => { throw new Error("boom"); }) as DigestArchiveClient["set"],
      del: (async () => { throw new Error("boom"); }) as DigestArchiveClient["del"],
    };
    const out = await readDigestBody("2026-04-22", { client: throwing });
    expect(out).toBeNull();
  });
});
