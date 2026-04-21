/**
 * Registry deps-discovery endpoint — source #6 of the discovery
 * pipeline. Uses ecosyste.ms `/dependent_packages` (see
 * registry-deps.ts for provenance rationale) to find npm packages
 * that depend on the canonical AI SDKs / frameworks, resolves each
 * to its GitHub repo, and runs them through the same deterministic
 * shape verifier as Code Search and Topics discovery.
 *
 * Auth: shared INGEST_SECRET (same class of write-side cron endpoint
 * as /api/registry/discover, /api/registry/topics, and
 * /api/registry/backfill-events).
 *
 * Query params:
 *   - source=<string>       Label for RegistryMeta.lastDiscoverySource.
 *                           Default "deps".
 *   - cap=<int>             Max repos to verify this run. Default 60,
 *                           hard cap 200.
 *   - pagesPerPackage=<int> Pages per target package (1-10). Default 2.
 *   - packages=<csv>        Comma-separated subset of target packages.
 *                           Unspecified → full TARGET_PACKAGES list.
 *
 * maxDuration=120 matches /topics + /backfill-events: the ecosyste.ms
 * sweep itself is fast (sub-second per page) but the verifier loop
 * needs 6 Contents probes + ≤2 verifier calls + 1 repo-meta per
 * verified candidate. A cap=60 pass routinely needs 90s.
 */

import { NextResponse } from "next/server";
import { runDepsDiscovery, TARGET_PACKAGES } from "@/lib/data/registry-deps";
import { writeCronHealth } from "@/lib/data/cron-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  const source = url.searchParams.get("source") ?? "deps";
  const capParam = url.searchParams.get("cap");
  const pagesParam = url.searchParams.get("pagesPerPackage");
  const packagesParam = url.searchParams.get("packages");

  const cap = capParam ? clamp(Number.parseInt(capParam, 10) || 60, 1, 200) : 60;
  const pagesPerPackage = pagesParam
    ? clamp(Number.parseInt(pagesParam, 10) || 2, 1, 10)
    : 2;
  const packages = packagesParam
    ? packagesParam
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0 && TARGET_PACKAGES.includes(p))
    : undefined;

  let result;
  try {
    result = await runDepsDiscovery({
      source,
      cap,
      pagesPerPackage,
      packages,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeCronHealth("registry-discover-deps", { ok: false, error: msg });
    throw e;
  }
  await writeCronHealth("registry-discover-deps", {
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
