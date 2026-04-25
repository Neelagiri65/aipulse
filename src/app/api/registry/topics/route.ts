/**
 * Registry topics-discovery endpoint — source #3 of the discovery
 * pipeline. Uses GitHub `/search/repositories?q=topic:X` to find
 * self-identified AI-tool repos that may or may not also surface via
 * Code Search. Every candidate still passes the deterministic shape
 * verifier before entering the registry.
 *
 * Auth: shared INGEST_SECRET (same class of write-side cron endpoint as
 * /api/registry/discover and /api/registry/backfill-events).
 *
 * Query params:
 *   - source=<string>          Label for RegistryMeta.lastDiscoverySource.
 *                              Default "topics".
 *   - cap=<int>                Max repos to verify this run. Default 60,
 *                              hard cap 200.
 *   - pagesPerTopic=<int>      Pages per topic (1-10). Default 2.
 *   - topics=<csv>             Comma-separated subset of topics to sweep.
 *                              Unspecified → full TOPICS list.
 *
 * maxDuration=300 matches /digest/send + /registry/discover. Production
 * runs were 504-ing at the previous 120s cap because Search inter-call
 * delays + per-candidate verifier work routinely push past 90s on a
 * cap=60 sweep — the 90s estimate in the original comment was optimistic.
 * Bumped to 300s for headroom; cap=60 + pagesPerTopic=2 still bounds the
 * total work, the timeout was just the wrong tripwire.
 */

import { NextResponse } from "next/server";
import { runTopicsDiscovery, TOPICS } from "@/lib/data/registry-topics";
import { writeCronHealth } from "@/lib/data/cron-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const requiredSecret = process.env.INGEST_SECRET;
  if (!requiredSecret) {
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET not configured on server" },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-ingest-secret");
  if (provided !== requiredSecret) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const source = url.searchParams.get("source") ?? "topics";
  const capParam = url.searchParams.get("cap");
  const pagesParam = url.searchParams.get("pagesPerTopic");
  const topicsParam = url.searchParams.get("topics");

  const cap = capParam ? clamp(Number.parseInt(capParam, 10) || 60, 1, 200) : 60;
  const pagesPerTopic = pagesParam
    ? clamp(Number.parseInt(pagesParam, 10) || 2, 1, 10)
    : 2;
  const topics = topicsParam
    ? topicsParam
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && TOPICS.includes(t))
    : undefined;

  let result;
  try {
    result = await runTopicsDiscovery({
      source,
      cap,
      pagesPerTopic,
      topics,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeCronHealth("registry-discover-topics", {
      ok: false,
      error: msg,
    });
    throw e;
  }
  await writeCronHealth("registry-discover-topics", {
    ok: true,
    itemsProcessed: result.written,
  });

  return NextResponse.json({ ok: true, result });
}

export async function GET(request: Request) {
  return POST(request);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
