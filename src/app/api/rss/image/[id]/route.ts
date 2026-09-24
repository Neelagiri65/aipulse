/**
 * GET /api/rss/image/<itemId> — the publisher's own image for one ingested article, relayed so
 * the iOS app (which may only talk to gawk.dev) and readers' phones never contact publisher CDNs.
 * All rules live in `proxyRssImage`; this file only adapts it to a Response.
 */
import { NextResponse } from "next/server";
import { readItem } from "@/lib/data/rss-store";
import { proxyRssImage } from "@/lib/data/rss-image-proxy";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await proxyRssImage(id, { readItem });
  if (r.status !== 200 || !r.body) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status, headers: r.headers });
  }
  return new Response(r.body as unknown as BodyInit, { status: 200, headers: r.headers });
}
