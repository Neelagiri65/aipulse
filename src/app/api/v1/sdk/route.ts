import { handleGetSdkAdoption } from "@/app/api/panels/sdk-adoption/route";
import { handleV1Request } from "@/lib/api/v1-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleV1Request(request, async () => {
    const { dto, cacheHeader } = await handleGetSdkAdoption(request);
    return {
      body: dto,
      cacheControl: cacheHeader,
      meta: {
        sourceCount: dto.packages?.length ?? 0,
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
