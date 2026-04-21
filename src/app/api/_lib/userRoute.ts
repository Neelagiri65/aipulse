/**
 * withUserRoute — shared wrapper for user-facing API routes (subscribe,
 * confirm, unsubscribe, consent). Sibling to withIngest; distinct so the
 * shapes don't mix: withIngest reports cron-health on each run, this
 * one doesn't.
 *
 * Provides:
 *   - ULID-ish trace id returned in `x-aip-trace` + logged on errors
 *     so users can quote it to support.
 *   - Structured JSON error envelope: {error, code, traceId}.
 *   - Try/catch around the handler so a thrown exception becomes a
 *     500 with the trace id rather than crashing the edge function.
 *
 * Does NOT:
 *   - Enforce rate limits (handlers do it — different routes use
 *     different keys + windows).
 *   - Verify Turnstile (only /api/subscribe needs it).
 *   - Parse bodies (JSON, form, or otherwise).
 */

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export type UserRouteHandler = (ctx: UserRouteContext) => Promise<NextResponse>;

export type UserRouteContext = {
  request: Request;
  traceId: string;
};

export type UserRouteError = {
  status: number;
  code: string;
  message: string;
};

export function newTraceId(): string {
  return randomBytes(12).toString("hex");
}

export function withUserRoute(handler: UserRouteHandler) {
  return async (request: Request): Promise<NextResponse> => {
    const traceId = newTraceId();
    try {
      const response = await handler({ request, traceId });
      response.headers.set("x-aip-trace", traceId);
      return response;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(
        JSON.stringify({
          trace: traceId,
          level: "error",
          message: `user-route threw: ${message}`,
        }),
      );
      return jsonError(
        { status: 500, code: "INTERNAL", message: "internal server error" },
        traceId,
      );
    }
  };
}

export function jsonError(
  err: UserRouteError,
  traceId: string,
): NextResponse {
  const resp = NextResponse.json(
    { error: err.message, code: err.code, traceId },
    { status: err.status },
  );
  resp.headers.set("x-aip-trace", traceId);
  return resp;
}

export function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}
