/**
 * Shared middleware for /api/v1/* routes.
 *
 * Provides: in-memory rate limiting (100 req/hr per IP), CORS headers
 * for cross-origin consumption, and X-Gawk-* response headers.
 *
 * In-memory rate limiter resets on cold start — acceptable trade-off
 * for zero Redis cost. Not a security boundary, just abuse prevention.
 */

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }

  bucket.count += 1;

  if (rateBuckets.size > 10_000) {
    for (const [key, b] of rateBuckets) {
      if (now >= b.resetAt) rateBuckets.delete(key);
    }
  }

  return {
    allowed: bucket.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - bucket.count),
    resetAt: bucket.resetAt,
  };
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

type V1Meta = {
  sourceCount?: number;
  generatedAt: string;
  cacheMaxAge?: number;
};

export type V1HandlerResult = {
  body: unknown;
  status?: number;
  cacheControl?: string;
  meta: V1Meta;
};

export async function handleV1Request(
  request: Request,
  handler: () => Promise<V1HandlerResult>,
): Promise<Response> {
  if (request.method === "OPTIONS") return corsPreflightResponse();

  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);

  if (!rl.allowed) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: "rate_limit_exceeded", retryAfter },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
        },
      },
    );
  }

  const result = await handler();

  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    "X-Gawk-Generated-At": result.meta.generatedAt,
    "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
  };

  if (result.meta.sourceCount !== undefined) {
    headers["X-Gawk-Source-Count"] = String(result.meta.sourceCount);
  }
  if (result.meta.cacheMaxAge !== undefined) {
    headers["X-Gawk-Cache-Age"] = String(result.meta.cacheMaxAge);
  }
  if (result.cacheControl) {
    headers["Cache-Control"] = result.cacheControl;
  }

  return Response.json(result.body, {
    status: result.status ?? 200,
    headers,
  });
}
