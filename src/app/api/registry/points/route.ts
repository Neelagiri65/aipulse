/**
 * `/api/registry/points` — the registry as map dots.
 *
 * Located entries only, and only the fields a dot and its hover card need.
 * This is what `Dashboard.tsx` polls; `/api/registry` (every entry, every
 * field) stays for external callers. Shape and rationale in
 * `src/lib/data/registry-points.ts`.
 */

import { NextResponse } from "next/server";

import { buildRegistryPointsBody } from "@/lib/data/registry-points";
import { REGISTRY_CACHE_CONTROL } from "@/lib/data/registry-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const body = await buildRegistryPointsBody();
  return NextResponse.json(body, {
    headers: { "Cache-Control": REGISTRY_CACHE_CONTROL },
  });
}
