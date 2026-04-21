import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  clientIp,
  jsonError,
  newTraceId,
  withUserRoute,
} from "@/app/api/_lib/userRoute";

function req(
  url: string,
  init?: { headers?: Record<string, string> },
): Request {
  return new Request(url, { headers: init?.headers });
}

describe("newTraceId", () => {
  it("returns 24 hex characters", () => {
    const id = newTraceId();
    expect(id).toMatch(/^[0-9a-f]{24}$/);
  });

  it("produces distinct ids across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(newTraceId());
    expect(seen.size).toBe(100);
  });
});

describe("withUserRoute", () => {
  it("calls the handler and stamps x-aip-trace on success", async () => {
    let seenTrace: string | null = null;
    const handler = withUserRoute(async (ctx) => {
      seenTrace = ctx.traceId;
      return NextResponse.json({ ok: true });
    });
    const resp = await handler(req("http://localhost/"));
    expect(resp.status).toBe(200);
    const header = resp.headers.get("x-aip-trace");
    expect(header).toBe(seenTrace);
    expect(header).toMatch(/^[0-9a-f]{24}$/);
  });

  it("turns thrown errors into 500 with a structured envelope", async () => {
    const handler = withUserRoute(async () => {
      throw new Error("boom");
    });
    const resp = await handler(req("http://localhost/"));
    expect(resp.status).toBe(500);
    const body = (await resp.json()) as {
      error: string;
      code: string;
      traceId: string;
    };
    expect(body.code).toBe("INTERNAL");
    expect(body.error).toMatch(/internal/i);
    expect(body.traceId).toMatch(/^[0-9a-f]{24}$/);
    expect(resp.headers.get("x-aip-trace")).toBe(body.traceId);
  });
});

describe("jsonError", () => {
  it("produces a structured envelope with code, error, traceId", async () => {
    const resp = jsonError(
      { status: 400, code: "BAD", message: "nope" },
      "trace-123",
    );
    expect(resp.status).toBe(400);
    expect(resp.headers.get("x-aip-trace")).toBe("trace-123");
    const body = await resp.json();
    expect(body).toEqual({ error: "nope", code: "BAD", traceId: "trace-123" });
  });
});

describe("clientIp", () => {
  it("reads the first entry of x-forwarded-for", () => {
    const r = req("http://localhost/", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" },
    });
    expect(clientIp(r)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const r = req("http://localhost/", {
      headers: { "x-real-ip": "5.6.7.8" },
    });
    expect(clientIp(r)).toBe("5.6.7.8");
  });

  it("returns null when neither header is present", () => {
    expect(clientIp(req("http://localhost/"))).toBeNull();
  });

  it("trims whitespace from the parsed value", () => {
    const r = req("http://localhost/", {
      headers: { "x-forwarded-for": "   1.2.3.4   , 5.6.7.8" },
    });
    expect(clientIp(r)).toBe("1.2.3.4");
  });
});
