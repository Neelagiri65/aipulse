/**
 * Registry discovery endpoint — triggered by the registry-discover cron
 * (every 6h) or by a manual `gh workflow run` dispatch for seeding.
 *
 * Auth: reuses INGEST_SECRET via the `x-ingest-secret` header so we
 * don't proliferate secrets for what is conceptually the same class of
 * write-side endpoint (cron-triggered background work).
 *
 * Query params:
 *   - source=<string>     Label for the RegistryMeta.lastDiscoverySource.
 *                         Defaults to "cron". Use "manual-seed" when
 *                         dispatching by hand.
 *   - maxVerify=<int>     Override per-run verification cap. Cron default
 *                         40 stays under the 60s Vercel timeout. Seed
 *                         dispatches can safely push to 200 with 300s
 *                         maxDuration.
 *   - skipKnown=<0|1>     0 to force re-verification of already-known
 *                         repos (use for periodic refresh sweeps).
 *                         Default 1 — prioritise new discoveries.
 *   - pages=<int>         Code-search pages per kind (max 10). Default 3.
 *                         Seed runs bump this to 10 to sweep the full
 *                         1000-result cap per filename.
 *
 * Rate budget per run: 60 search calls (at pages=10 × 6 kinds) + up to
 * maxVerify×2 contents/repos calls. Fits within the 5000/hr auth limit
 * shared with the existing globe pipeline.
 */

import { NextResponse } from "next/server";
import { runRegistryDiscovery } from "@/lib/data/registry-discovery";
import { writeCronHealth } from "@/lib/data/cron-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Seed runs need more headroom than 60s; cron runs finish well under.
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
  const source = url.searchParams.get("source") ?? "cron";
  const maxVerifyParam = url.searchParams.get("maxVerify");
  const pagesParam = url.searchParams.get("pages");
  const skipKnownParam = url.searchParams.get("skipKnown");

  const maxVerify = maxVerifyParam
    ? clamp(Number.parseInt(maxVerifyParam, 10) || 40, 1, 500)
    : 40;
  const searchPagesPerKind = pagesParam
    ? clamp(Number.parseInt(pagesParam, 10) || 3, 1, 10)
    : 3;
  const skipKnown = skipKnownParam === "0" ? false : true;

  let result;
  try {
    result = await runRegistryDiscovery({
      source,
      maxVerify,
      searchPagesPerKind,
      skipKnown,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeCronHealth("registry-discover", { ok: false, error: msg });
    throw e;
  }
  await writeCronHealth("registry-discover", {
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
