/**
 * /api/admin/cli-usage — read side of the passive CLI telemetry
 * (lib/telemetry/cli-usage.ts). Aggregates only: HyperLogLog daily
 * uniques + per-command request counts. First widget of the operator
 * console.
 *
 * Auth: same admin Basic Auth as /admin pages — but enforced HERE, not
 * in middleware (the middleware matcher deliberately excludes /api/*).
 */

import { Redis } from "@upstash/redis";

import { verifyAdminBasicAuth } from "@/lib/digest/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMANDS = ["wire", "models", "sdk", "tools"] as const;
const MAX_DAYS = 90;

export async function GET(request: Request) {
  const user = process.env.ADMIN_PREVIEW_USER;
  const pass = process.env.ADMIN_PREVIEW_PASS;
  if (!user || !pass || !verifyAdminBasicAuth(request.headers.get("authorization"), { user, pass })) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "www-authenticate": 'Basic realm="Gawk admin"', "cache-control": "no-store" },
    });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return Response.json({ error: "redis_not_configured" }, { status: 503 });
  }
  const redis = new Redis({ url, token });

  const daysParam = Number(new URL(request.url).searchParams.get("days") ?? "7");
  const days = Math.min(MAX_DAYS, Math.max(1, Number.isFinite(daysParam) ? daysParam : 7));

  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const p = redis.pipeline();
    p.pfcount(`cli:dau:${day}`);
    for (const c of COMMANDS) p.get(`cli:reqs:${c}:${day}`);
    const [uniques, ...mix] = (await p.exec()) as [number, ...(number | null)[]];
    rows.push({
      day,
      uniques: uniques ?? 0,
      commands: Object.fromEntries(COMMANDS.map((c, idx) => [c, Number(mix[idx] ?? 0)])),
    });
  }

  return Response.json(
    {
      rows,
      note: "aggregates only — uniques are a HyperLogLog estimate over date-salted hashes; raw IPs are never stored",
      generatedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
