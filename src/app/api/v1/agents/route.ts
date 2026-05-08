import { handleGetAgentsPanel } from "@/app/api/panels/agents/route";
import { handleV1Request } from "@/lib/api/v1-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleV1Request(request, async () => {
    const { dto, cacheHeader } = await handleGetAgentsPanel();
    if (!dto) {
      return {
        body: { error: "no_data", message: "Agent data not seeded yet" },
        status: 503,
        cacheControl: "no-store",
        meta: {
          sourceCount: 0,
          generatedAt: new Date().toISOString(),
        },
      };
    }
    return {
      body: dto,
      cacheControl: cacheHeader,
      meta: {
        sourceCount: dto.rows?.length ?? 0,
        generatedAt: dto.generatedAt,
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
