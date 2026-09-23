/**
 * `/api/registry/cells` — the registry as occupancy on the shared world band.
 *
 * `?cols=60` (default, the iOS band) or `?cols=90` (the web homepage grid).
 * Shape and rationale in `src/lib/data/registry-cells.ts`. ~2.6 KB against
 * `/api/registry/points`' 7.0 MB, because the app needs which cells are solid,
 * not 25,475 coordinates.
 */
import { NextResponse } from "next/server";

import { buildRegistryCellsBody, parseCellColumns } from "@/lib/data/registry-cells";
import { REGISTRY_CACHE_CONTROL } from "@/lib/data/registry-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cols = parseCellColumns(new URL(request.url).searchParams.get("cols"));
  const body = await buildRegistryCellsBody(cols);
  return NextResponse.json(body, {
    headers: { "Cache-Control": REGISTRY_CACHE_CONTROL },
  });
}
