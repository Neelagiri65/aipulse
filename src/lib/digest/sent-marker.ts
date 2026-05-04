/**
 * Redis-backed idempotency markers for the daily digest send.
 *
 * Keyed by UTC date — the orchestrator writes the marker after a
 * successful send (≥1 recipient delivered) and reads it at the start
 * of the next invocation to short-circuit duplicate sends. Root cause
 * of the 2026-05-01 + 2026-05-02 double-fires: manual `workflow_dispatch`
 * re-running on top of the scheduled 08:00 UTC run with no server-side
 * guard.
 *
 * Failure mode: when Redis is unavailable, both reads and writes
 * silently no-op. Reads return null → orchestrator falls through to a
 * normal send (better to over-send once during a Redis outage than to
 * silently skip the day's digest forever). Writes swallow errors —
 * never break the send pipeline that just succeeded.
 *
 * TTL: 30 days. The marker only needs to survive long enough that no
 * legitimate operator workflow re-fires the same date; 30d is well
 * past any retry / catch-up window and trivial against the free-tier
 * Upstash budget.
 *
 * Injectable client mirrors the digest archive pattern — production
 * passes nothing and gets the singleton, tests pass an in-memory fake.
 */

import { Redis } from "@upstash/redis";
import type { SentMarker } from "@/lib/digest/send-orchestrator";

const KEY_PREFIX = "digest:sent:";
const TTL_SECONDS = 30 * 24 * 60 * 60;

export type SentMarkerClient = Pick<Redis, "get" | "set" | "del">;

let cached: Redis | null | undefined;

function defaultClient(): SentMarkerClient | null {
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

export function __resetSentMarkerClientCache(): void {
  cached = undefined;
}

export function sentMarkerKey(date: string): string {
  return `${KEY_PREFIX}${date}`;
}

type Opts = { client?: SentMarkerClient };

export async function readSentMarker(
  date: string,
  opts: Opts = {},
): Promise<SentMarker | null> {
  const r = opts.client ?? defaultClient();
  if (!r) return null;
  try {
    const v = await r.get(sentMarkerKey(date));
    if (!v) return null;
    const obj = typeof v === "string" ? JSON.parse(v) : v;
    return parseMarker(obj);
  } catch {
    return null;
  }
}

export async function writeSentMarker(
  date: string,
  marker: SentMarker,
  opts: Opts = {},
): Promise<void> {
  const r = opts.client ?? defaultClient();
  if (!r) return;
  try {
    await r.set(sentMarkerKey(date), JSON.stringify(marker), {
      ex: TTL_SECONDS,
    });
  } catch {
    // never propagate — observability must not break the thing it observes.
  }
}

function parseMarker(obj: unknown): SentMarker | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (
    typeof o.sentAt === "string" &&
    typeof o.recipientCount === "number" &&
    typeof o.deliveredCount === "number" &&
    typeof o.subject === "string"
  ) {
    return obj as SentMarker;
  }
  return null;
}
