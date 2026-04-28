import { describe, expect, it } from "vitest";
import { verifyTurnstile } from "@/lib/turnstile";

function fetchReturning(
  body: { success: boolean; "error-codes"?: string[] },
  status = 200,
): typeof fetch {
  return (async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function fetchThrowing(message: string): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

describe("verifyTurnstile", () => {
  it("returns ok on siteverify success=true", async () => {
    const result = await verifyTurnstile({
      token: "tkn",
      secret: "s",
      fetchImpl: fetchReturning({ success: true }),
    });
    expect(result.ok).toBe(true);
  });

  it("returns rejected with joined error codes when success=false", async () => {
    const result = await verifyTurnstile({
      token: "tkn",
      secret: "s",
      fetchImpl: fetchReturning({
        success: false,
        "error-codes": ["invalid-input-response", "timeout-or-duplicate"],
      }),
    });
    expect(result).toEqual({
      ok: false,
      reason: "rejected",
      detail: "invalid-input-response,timeout-or-duplicate",
    });
  });

  it("fails closed on HTTP non-200 as network", async () => {
    const result = await verifyTurnstile({
      token: "tkn",
      secret: "s",
      fetchImpl: fetchReturning({ success: true }, 500),
    });
    expect(result).toEqual({ ok: false, reason: "network", detail: "HTTP 500" });
  });

  it("fails closed on thrown fetch errors as network", async () => {
    const result = await verifyTurnstile({
      token: "tkn",
      secret: "s",
      fetchImpl: fetchThrowing("ENETDOWN"),
    });
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toBe("network");
  });

  it("short-circuits with no-token when token is empty", async () => {
    const result = await verifyTurnstile({ token: "", secret: "s" });
    expect(result).toEqual({ ok: false, reason: "no-token" });
  });

  it("gracefully skips (returns ok) when secret is unset — symmetric with the client widget skipping when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset", async () => {
    const original = process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    try {
      const result = await verifyTurnstile({ token: "tkn" });
      expect(result).toEqual({ ok: true });
    } finally {
      if (original !== undefined) process.env.TURNSTILE_SECRET_KEY = original;
    }
  });

  it("gracefully skips (returns ok) when secret is unset AND token is also empty", async () => {
    const original = process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    try {
      const result = await verifyTurnstile({ token: "" });
      expect(result).toEqual({ ok: true });
    } finally {
      if (original !== undefined) process.env.TURNSTILE_SECRET_KEY = original;
    }
  });

  it("still rejects no-token when the secret IS set (configured deployments must enforce the gate)", async () => {
    const result = await verifyTurnstile({ token: "", secret: "s" });
    expect(result).toEqual({ ok: false, reason: "no-token" });
  });
});
