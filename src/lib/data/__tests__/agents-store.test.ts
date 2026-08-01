/**
 * Agents-store write outcomes. The reads stay fail-soft (panel renders
 * a gap); the writes must REPORT rejection so the ingest orchestrator
 * can fold it into ok:false — the 2026-07 Upstash incident hid two
 * weeks of rejected persists behind void-returning writes.
 */

import { describe, expect, it } from "vitest";
import {
  snapshotKey,
  writeAgentsLatest,
  writeAgentsSnapshot,
  type AgentsWriteClient,
} from "@/lib/data/agents-store";
import type { AgentFetchResult } from "@/lib/data/agents-fetch";

const BLOB = {
  fetchedAt: "2026-08-01T06:30:00Z",
  frameworks: [],
} as unknown as AgentFetchResult;

describe("writeAgentsLatest", () => {
  it("reports ok and writes the blob under agents:latest", async () => {
    const calls: Array<[string, string]> = [];
    const client: AgentsWriteClient = {
      set: async (key, value) => {
        calls.push([key, value]);
        return "OK";
      },
    };
    const result = await writeAgentsLatest(BLOB, client);
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("agents:latest");
    expect(JSON.parse(calls[0][1]).fetchedAt).toBe("2026-08-01T06:30:00Z");
  });

  it("reports ok:false with the message when the write is rejected", async () => {
    const client: AgentsWriteClient = {
      set: async () => {
        throw new Error("max requests limit exceeded");
      },
    };
    const result = await writeAgentsLatest(BLOB, client);
    expect(result).toEqual({
      ok: false,
      message: "max requests limit exceeded",
    });
  });

  it("reports ok:false when redis is unconfigured", async () => {
    const result = await writeAgentsLatest(BLOB, null);
    expect(result).toEqual({ ok: false, message: "redis not configured" });
  });
});

describe("writeAgentsSnapshot", () => {
  it("reports ok and writes the dated key with a TTL", async () => {
    const calls: Array<[string, string, { ex: number } | undefined]> = [];
    const client: AgentsWriteClient = {
      set: async (key, value, opts) => {
        calls.push([key, value, opts]);
        return "OK";
      },
    };
    const result = await writeAgentsSnapshot("2026-08-01", BLOB, client);
    expect(result).toEqual({ ok: true });
    expect(calls[0][0]).toBe(snapshotKey("2026-08-01"));
    expect(calls[0][2]?.ex).toBe(14 * 24 * 60 * 60);
  });

  it("reports ok:false with the message when the write is rejected", async () => {
    const client: AgentsWriteClient = {
      set: async () => {
        throw new Error("quota exhausted");
      },
    };
    const result = await writeAgentsSnapshot("2026-08-01", BLOB, client);
    expect(result).toEqual({ ok: false, message: "quota exhausted" });
  });

  it("reports ok:false when redis is unconfigured", async () => {
    const result = await writeAgentsSnapshot("2026-08-01", BLOB, null);
    expect(result).toEqual({ ok: false, message: "redis not configured" });
  });
});
