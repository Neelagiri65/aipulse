/**
 * OpenRouter-store write outcomes. Exercises the standalone
 * client-injectable helpers behind redisOpenRouterStore's writes —
 * in particular the three-way append result that used to collapse
 * "already present" (fine) and "write rejected" (data loss) into the
 * same false.
 */

import { describe, expect, it } from "vitest";
import {
  RANKINGS_LATEST_KEY,
  SNAPSHOTS_KEY,
  writeDailySnapshotIfAbsentWith,
  writeRankingsLatestWith,
  type OpenRouterWriteClient,
} from "@/lib/data/openrouter-store";
import type {
  ModelUsageDto,
  ModelUsageSnapshotRow,
} from "@/lib/data/openrouter-types";

const DTO = { fetchedAt: "2026-08-01T06:45:00Z", rows: [] } as unknown as ModelUsageDto;

const ROW: ModelUsageSnapshotRow = {
  date: "2026-08-01",
  ordering: "top-weekly",
  slugs: ["anthropic/claude-sonnet-4.6"],
};

function mkClient(overrides: Partial<OpenRouterWriteClient> = {}): OpenRouterWriteClient & {
  sets: Array<[string, string]>;
  hsets: Array<[string, Record<string, string>]>;
} {
  const sets: Array<[string, string]> = [];
  const hsets: Array<[string, Record<string, string>]> = [];
  return {
    sets,
    hsets,
    set: async (key, value) => {
      sets.push([key, value]);
      return "OK";
    },
    hget: async () => null,
    hset: async (key, fields) => {
      hsets.push([key, fields]);
      return 1;
    },
    ...overrides,
  };
}

describe("writeRankingsLatestWith", () => {
  it("reports ok and writes the DTO under the latest key", async () => {
    const client = mkClient();
    const result = await writeRankingsLatestWith(client, DTO);
    expect(result).toEqual({ ok: true });
    expect(client.sets[0][0]).toBe(RANKINGS_LATEST_KEY);
  });

  it("reports ok:false with the message when the write is rejected", async () => {
    const client = mkClient({
      set: async () => {
        throw new Error("max requests limit exceeded");
      },
    });
    const result = await writeRankingsLatestWith(client, DTO);
    expect(result).toEqual({
      ok: false,
      message: "max requests limit exceeded",
    });
  });

  it("reports ok:false when redis is unconfigured", async () => {
    const result = await writeRankingsLatestWith(null, DTO);
    expect(result).toEqual({ ok: false, message: "redis not configured" });
  });
});

describe("writeDailySnapshotIfAbsentWith", () => {
  it("writes and reports wrote:true when the date is absent", async () => {
    const client = mkClient();
    const result = await writeDailySnapshotIfAbsentWith(client, "2026-08-01", ROW);
    expect(result).toEqual({ wrote: true });
    expect(client.hsets[0][0]).toBe(SNAPSHOTS_KEY);
    expect(JSON.parse(client.hsets[0][1]["2026-08-01"]).slugs).toEqual([
      "anthropic/claude-sonnet-4.6",
    ]);
  });

  it("skips with wrote:false and NO error when the date is already present — idempotency, not failure", async () => {
    const client = mkClient({ hget: async () => "{}" });
    const result = await writeDailySnapshotIfAbsentWith(client, "2026-08-01", ROW);
    expect(result).toEqual({ wrote: false });
    expect(client.hsets).toHaveLength(0);
  });

  it("reports wrote:false WITH the error when the command is rejected", async () => {
    const client = mkClient({
      hget: async () => {
        throw new Error("max requests limit exceeded");
      },
    });
    const result = await writeDailySnapshotIfAbsentWith(client, "2026-08-01", ROW);
    expect(result).toEqual({
      wrote: false,
      error: "max requests limit exceeded",
    });
  });

  it("reports wrote:false with an error when redis is unconfigured", async () => {
    const result = await writeDailySnapshotIfAbsentWith(null, "2026-08-01", ROW);
    expect(result).toEqual({ wrote: false, error: "redis not configured" });
  });
});
