/**
 * Public v1 read of the verified AI-config repo registry.
 *
 * Paged. See `registry-response.ts` for the shape and for why the whole
 * corpus is no longer a single response (38MB, 25–30s, unparseable by `jq`,
 * growing ~520 entries a day as of 2026-09-18).
 */

import { handleV1Request } from "@/lib/api/v1-middleware";
import {
  REGISTRY_CACHE_CONTROL,
  buildRegistryBody,
  responseCount,
} from "@/lib/data/registry-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleV1Request(request, async () => {
    // `degraded` distinguishes "no repos" from "could not read". Without
    // it an API consumer counts `entries` and republishes a zero we never
    // measured. See /api/registry for the full rationale.
    const body = await buildRegistryBody(new URL(request.url));
    return {
      body,
      cacheControl: REGISTRY_CACHE_CONTROL,
      meta: {
        // Items in THIS response. The corpus size is `page.total`.
        sourceCount: responseCount(body),
        generatedAt: body.generatedAt,
        cacheMaxAge: 300,
      },
    };
  });
}

export async function OPTIONS(request: Request) {
  return handleV1Request(request, async () => ({
    body: null,
    meta: { generatedAt: new Date().toISOString() },
  }));
}
