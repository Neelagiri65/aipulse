import { describe, it, expect, beforeEach } from "vitest";
import { handleV1Request, corsPreflightResponse } from "../v1-middleware";

function makeRequest(
  ip = "1.2.3.4",
  method = "GET",
): Request {
  return new Request("https://gawk.dev/api/v1/test", {
    method,
    headers: { "x-forwarded-for": ip },
  });
}

describe("v1-middleware", () => {
  describe("CORS preflight", () => {
    it("returns 204 with CORS headers", () => {
      const res = corsPreflightResponse();
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, OPTIONS",
      );
    });
  });

  describe("handleV1Request", () => {
    it("adds CORS headers to every response", async () => {
      const res = await handleV1Request(makeRequest(), async () => ({
        body: { ok: true },
        meta: { generatedAt: "2026-05-08T00:00:00Z" },
      }));
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("adds X-Gawk-Generated-At header", async () => {
      const res = await handleV1Request(makeRequest(), async () => ({
        body: { ok: true },
        meta: { generatedAt: "2026-05-08T12:00:00Z" },
      }));
      expect(res.headers.get("X-Gawk-Generated-At")).toBe(
        "2026-05-08T12:00:00Z",
      );
    });

    it("adds X-Gawk-Source-Count when provided", async () => {
      const res = await handleV1Request(makeRequest(), async () => ({
        body: { items: [] },
        meta: { generatedAt: "2026-05-08T00:00:00Z", sourceCount: 42 },
      }));
      expect(res.headers.get("X-Gawk-Source-Count")).toBe("42");
    });

    it("omits X-Gawk-Source-Count when not provided", async () => {
      const res = await handleV1Request(makeRequest(), async () => ({
        body: { items: [] },
        meta: { generatedAt: "2026-05-08T00:00:00Z" },
      }));
      expect(res.headers.has("X-Gawk-Source-Count")).toBe(false);
    });

    it("adds X-Gawk-Cache-Age when provided", async () => {
      const res = await handleV1Request(makeRequest(), async () => ({
        body: {},
        meta: { generatedAt: "2026-05-08T00:00:00Z", cacheMaxAge: 300 },
      }));
      expect(res.headers.get("X-Gawk-Cache-Age")).toBe("300");
    });

    it("sets Cache-Control from handler result", async () => {
      const res = await handleV1Request(makeRequest(), async () => ({
        body: {},
        cacheControl: "public, s-maxage=60",
        meta: { generatedAt: "2026-05-08T00:00:00Z" },
      }));
      expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60");
    });

    it("includes rate limit headers", async () => {
      const res = await handleV1Request(
        makeRequest("10.0.0.1"),
        async () => ({
          body: {},
          meta: { generatedAt: "2026-05-08T00:00:00Z" },
        }),
      );
      expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
      expect(Number(res.headers.get("X-RateLimit-Remaining"))).toBeLessThanOrEqual(100);
      expect(res.headers.has("X-RateLimit-Reset")).toBe(true);
    });

    it("handles OPTIONS as CORS preflight", async () => {
      const res = await handleV1Request(
        makeRequest("10.0.0.2", "OPTIONS"),
        async () => ({
          body: null,
          meta: { generatedAt: "2026-05-08T00:00:00Z" },
        }),
      );
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("returns custom status codes", async () => {
      const res = await handleV1Request(makeRequest("10.0.0.3"), async () => ({
        body: { error: "not_found" },
        status: 404,
        meta: { generatedAt: "2026-05-08T00:00:00Z" },
      }));
      expect(res.status).toBe(404);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 after exceeding 100 requests from same IP", async () => {
      const ip = `rate-test-${Date.now()}`;
      const handler = async () => ({
        body: { ok: true },
        meta: { generatedAt: "2026-05-08T00:00:00Z" },
      });

      for (let i = 0; i < 100; i++) {
        const res = await handleV1Request(makeRequest(ip), handler);
        expect(res.status).toBe(200);
      }

      const blocked = await handleV1Request(makeRequest(ip), handler);
      expect(blocked.status).toBe(429);

      const body = await blocked.json();
      expect(body.error).toBe("rate_limit_exceeded");
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(blocked.headers.get("Retry-After")).toBeTruthy();
    });

    it("does not share limits across different IPs", async () => {
      const ipA = `ip-a-${Date.now()}`;
      const ipB = `ip-b-${Date.now()}`;
      const handler = async () => ({
        body: { ok: true },
        meta: { generatedAt: "2026-05-08T00:00:00Z" },
      });

      for (let i = 0; i < 100; i++) {
        await handleV1Request(makeRequest(ipA), handler);
      }

      const resB = await handleV1Request(makeRequest(ipB), handler);
      expect(resB.status).toBe(200);
    });

    it("decrements remaining count on each request", async () => {
      const ip = `decrement-${Date.now()}`;
      const handler = async () => ({
        body: { ok: true },
        meta: { generatedAt: "2026-05-08T00:00:00Z" },
      });

      const first = await handleV1Request(makeRequest(ip), handler);
      const remaining1 = Number(first.headers.get("X-RateLimit-Remaining"));

      const second = await handleV1Request(makeRequest(ip), handler);
      const remaining2 = Number(second.headers.get("X-RateLimit-Remaining"));

      expect(remaining2).toBe(remaining1 - 1);
    });
  });
});
