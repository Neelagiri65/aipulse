import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Tests the env-gated skip path on /api/digest/send. When the four Resend
 * envs (API_KEY, DOMAIN_ID, FROM_ADDRESS, UNSUB_MAILTO) are absent, the
 * route must NOT throw — it must return 200 with reason:"resend-not-configured"
 * so the GitHub Actions workflow exits 0 and the cron-health record stays
 * green. The motivating bug: every 08:00 UTC fire was 500-ing while we
 * waited on DNS verification, polluting the GitHub profile activity feed.
 */
describe("/api/digest/send — Resend env skip", () => {
  const SAVED_ENV = { ...process.env };

  beforeEach(() => {
    process.env.INGEST_SECRET = "test-secret-skip";
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_DOMAIN_ID;
    delete process.env.EMAIL_FROM_ADDRESS;
    delete process.env.EMAIL_UNSUB_MAILTO;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    process.env = { ...SAVED_ENV };
  });

  it("returns 200 + reason:resend-not-configured when all four Resend envs are missing", async () => {
    const { POST } = await import("@/app/api/digest/send/route");
    const req = new Request("https://gawk.dev/api/digest/send", {
      method: "POST",
      headers: { "x-ingest-secret": "test-secret-skip" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("resend-not-configured");
    expect(body.missing).toEqual(
      expect.arrayContaining([
        "EMAIL_FROM_ADDRESS",
        "RESEND_API_KEY",
        "RESEND_DOMAIN_ID",
        "EMAIL_UNSUB_MAILTO",
      ]),
    );
    expect(body.message).toMatch(/paused/i);
  });

  it("lists only the missing envs when some Resend envs are present", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM_ADDRESS = "Gawk <hello@example.com>";

    const { POST } = await import("@/app/api/digest/send/route");
    const req = new Request("https://gawk.dev/api/digest/send", {
      method: "POST",
      headers: { "x-ingest-secret": "test-secret-skip" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reason).toBe("resend-not-configured");
    expect(body.missing).toEqual(
      expect.arrayContaining(["RESEND_DOMAIN_ID", "EMAIL_UNSUB_MAILTO"]),
    );
    expect(body.missing).not.toContain("RESEND_API_KEY");
    expect(body.missing).not.toContain("EMAIL_FROM_ADDRESS");
  });

  it("still rejects unauthenticated requests with 401", async () => {
    const { POST } = await import("@/app/api/digest/send/route");
    const req = new Request("https://gawk.dev/api/digest/send", {
      method: "POST",
      headers: { "x-ingest-secret": "wrong-secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
