/**
 * Agents-panel Redis store.
 *
 * Two key shapes:
 *   agents:latest                SET (JSON), no TTL. The most recent
 *                                fetch result. Overwritten every cron.
 *   agents:snapshot:{YYYY-MM-DD} SET (JSON), 14-day TTL. One per day.
 *                                The view assembler reads the snapshot
 *                                from 7 days ago to compute w/w deltas.
 *
 * Why a dedicated snapshot key instead of leaning on the existing
 * daily-snapshot collector? The daily-snapshot reads `pkg:*:latest`
 * blobs whose shape is per-registry/per-package; agents data is
 * per-framework and carries GH metadata that doesn't fit. 14d TTL is
 * enough for the 7d delta window plus one full week of headroom for
 * a missed cron run.
 *
 * Reads are fail-soft (null instead of throwing) — the panel renders
 * a gap. Writes REPORT their outcome: a rejected write means the panel
 * serves stale data while the cron stays green, so the ingest
 * orchestrator must be able to fold the failure into its result
 * (2026-07 Upstash incident: this store's swallowed writes kept
 * agents-ingest green for two weeks of rejected persists).
 */

import { Redis } from "@upstash/redis";
import type { AgentFetchResult } from "@/lib/data/agents-fetch";

export type AgentsWriteResult = { ok: true } | { ok: false; message: string };

/** Minimal client surface the writes need — lets tests inject a fake. */
export type AgentsWriteClient = {
  set: (
    key: string,
    value: string,
    opts?: { ex: number },
  ) => Promise<unknown>;
};

const LATEST_KEY = "agents:latest";
const SNAPSHOT_PREFIX = "agents:snapshot:";
const SNAPSHOT_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

let cached: Redis | null | undefined;

function redis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return cached;
  }
  cached = new Redis({ url, token });
  return cached;
}

export function isAgentsStoreAvailable(): boolean {
  return redis() !== null;
}

export function snapshotKey(date: string): string {
  return `${SNAPSHOT_PREFIX}${date}`;
}

export async function writeAgentsLatest(
  blob: AgentFetchResult,
  client: AgentsWriteClient | null = redis(),
): Promise<AgentsWriteResult> {
  if (!client) return { ok: false, message: "redis not configured" };
  try {
    await client.set(LATEST_KEY, JSON.stringify(blob));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function readAgentsLatest(): Promise<AgentFetchResult | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(LATEST_KEY);
    return parseFetchResult(v);
  } catch {
    return null;
  }
}

export async function writeAgentsSnapshot(
  date: string,
  blob: AgentFetchResult,
  client: AgentsWriteClient | null = redis(),
): Promise<AgentsWriteResult> {
  if (!client) return { ok: false, message: "redis not configured" };
  try {
    await client.set(snapshotKey(date), JSON.stringify(blob), {
      ex: SNAPSHOT_TTL_SECONDS,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function readAgentsSnapshot(
  date: string,
): Promise<AgentFetchResult | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(snapshotKey(date));
    return parseFetchResult(v);
  } catch {
    return null;
  }
}

function parseFetchResult(value: unknown): AgentFetchResult | null {
  if (!value) return null;
  try {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.fetchedAt !== "string" || !Array.isArray(o.frameworks)) {
      return null;
    }
    return obj as AgentFetchResult;
  } catch {
    return null;
  }
}
