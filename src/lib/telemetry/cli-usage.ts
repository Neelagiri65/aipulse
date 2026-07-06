/**
 * Passive, aggregate-only usage telemetry for gawk-cli — server-side.
 *
 * The CLI is deliberately zero-telemetry on the client (trust posture,
 * Auditor-endorsed). What we count lives entirely here, keyed off the
 * `User-Agent: gawk-cli` header the CLI has sent since 0.1.0:
 *
 *  - Daily active clients → Redis HyperLogLog (PFADD). The IP is
 *    date-salted and SHA-256-hashed before PFADD, and an HLL stores only
 *    register maxima — the raw IP is never written anywhere, and the
 *    daily salt makes cross-day linkage impossible. ~12KB fixed memory.
 *  - Command mix → plain INCR per endpoint per day.
 *
 * Budget: 4 Upstash commands per CLI request (PFADD + INCR + 2× EXPIRE NX),
 * pipelined into one HTTP round trip. Telemetry must NEVER affect the
 * request path: callers invoke via next/server `after()`, and every
 * failure here is swallowed (a lost count beats a broken route).
 */

import { createHash } from "crypto";

import { after } from "next/server";
import { Redis } from "@upstash/redis";

const KEY_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days of daily keys

/** Only the CLI is tracked; everything else (browsers, our own archiver, bots) is not. */
export function classifyAgent(userAgent: string | null | undefined): "gawk-cli" | null {
  if (!userAgent) return null;
  return userAgent === "gawk-cli" || userAgent.startsWith("gawk-cli/") ? "gawk-cli" : null;
}

/** Normalise a request path to a short endpoint label for the mix counter. */
export function endpointLabel(pathname: string): string {
  const known: Record<string, string> = {
    "/api/feed": "wire",
    "/api/v1/models": "models",
    "/api/v1/sdk": "sdk",
    "/api/v1/status": "tools",
  };
  return known[pathname] ?? pathname.replace(/^\/api\//, "").replace(/[^a-z0-9/-]/gi, "").slice(0, 40);
}

export function usageKeys(nowIso: string, label: string): { dau: string; reqs: string; day: string } {
  const day = nowIso.slice(0, 10); // UTC date from an ISO instant
  return {
    day,
    dau: `cli:dau:${day}`,
    reqs: `cli:reqs:${label}:${day}`,
  };
}

/**
 * Date-salted one-way hash of the client IP. Only this digest ever
 * reaches Redis, and only as an HLL observation — irreversible twice over.
 */
export function hashClient(ip: string, day: string): string {
  return createHash("sha256").update(`${day}:${ip}`).digest("hex");
}

let cached: Redis | null = null;
function redis(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

/**
 * Schedule tracking off the request path. In a real Next request scope
 * this uses after() (sanctioned post-response work — survives function
 * suspend, unlike a bare dangling promise, the #71 lesson). Outside one
 * (unit tests, tooling) it falls back to fire-and-forget, where the
 * UA/env gates make it a no-op anyway. Never throws.
 */
export function scheduleCliUsageTrack(request: Request): void {
  try {
    after(() => trackCliUsage(request));
  } catch {
    void trackCliUsage(request);
  }
}

/**
 * Record one CLI request. Safe to call unconditionally from a route
 * wrapper — non-CLI agents no-op before any I/O. Never throws.
 */
export async function trackCliUsage(request: Request): Promise<void> {
  try {
    if (classifyAgent(request.headers.get("user-agent")) !== "gawk-cli") return;
    const r = redis();
    if (!r) return;

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const label = endpointLabel(new URL(request.url).pathname);
    const { dau, reqs, day } = usageKeys(new Date().toISOString(), label);

    const p = r.pipeline();
    p.pfadd(dau, hashClient(ip, day));
    p.incr(reqs);
    p.expire(dau, KEY_TTL_SECONDS, "NX");
    p.expire(reqs, KEY_TTL_SECONDS, "NX");
    await p.exec();
  } catch (e) {
    console.warn(`cli-usage telemetry skipped: ${(e as Error).message}`);
  }
}
