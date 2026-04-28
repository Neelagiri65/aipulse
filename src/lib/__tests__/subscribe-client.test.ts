import { describe, expect, it } from "vitest";
import {
  SUBSCRIBE_PROMPT_DELAY_MS,
  isConsentResolved,
  readSubscribeCookies,
  responseToFormState,
  shouldShowSubscribePrompt,
} from "@/lib/subscribe-client";

describe("shouldShowSubscribePrompt", () => {
  const base = {
    betaEnabled: true,
    hasSubscribed: false,
    hasDismissed: false,
    consentResolved: true,
    elapsedMs: SUBSCRIBE_PROMPT_DELAY_MS,
  };

  it("shows when every gate passes", () => {
    expect(shouldShowSubscribePrompt(base)).toBe(true);
  });

  it("hides when beta is off", () => {
    expect(shouldShowSubscribePrompt({ ...base, betaEnabled: false })).toBe(
      false,
    );
  });

  it("hides when the visitor already subscribed", () => {
    expect(
      shouldShowSubscribePrompt({ ...base, hasSubscribed: true }),
    ).toBe(false);
  });

  it("hides when the visitor has dismissed the modal", () => {
    expect(
      shouldShowSubscribePrompt({ ...base, hasDismissed: true }),
    ).toBe(false);
  });

  it("hides when consent hasn't been resolved yet", () => {
    expect(
      shouldShowSubscribePrompt({ ...base, consentResolved: false }),
    ).toBe(false);
  });

  it("hides until the elapsed-time gate fires", () => {
    expect(
      shouldShowSubscribePrompt({ ...base, elapsedMs: 0 }),
    ).toBe(false);
    expect(
      shouldShowSubscribePrompt({
        ...base,
        elapsedMs: SUBSCRIBE_PROMPT_DELAY_MS - 1,
      }),
    ).toBe(false);
  });
});

describe("isConsentResolved", () => {
  it("treats non-covered jurisdictions as resolved", () => {
    expect(
      isConsentResolved({ covered: false, gpc: false, hasAnswered: false }),
    ).toBe(true);
  });

  it("treats Sec-GPC as resolved", () => {
    expect(
      isConsentResolved({ covered: true, gpc: true, hasAnswered: false }),
    ).toBe(true);
  });

  it("treats an answered banner as resolved", () => {
    expect(
      isConsentResolved({ covered: true, gpc: false, hasAnswered: true }),
    ).toBe(true);
  });

  it("treats an unanswered covered visitor as unresolved", () => {
    expect(
      isConsentResolved({ covered: true, gpc: false, hasAnswered: false }),
    ).toBe(false);
  });
});

describe("responseToFormState", () => {
  it("maps a pending response to sent", () => {
    expect(
      responseToFormState({ ok: true, status: "pending" }, "x@y.com"),
    ).toEqual({ kind: "sent", email: "x@y.com" });
  });

  it("maps a resent response to sent", () => {
    expect(
      responseToFormState({ ok: true, status: "resent" }, "x@y.com"),
    ).toEqual({ kind: "sent", email: "x@y.com" });
  });

  it("maps already_confirmed to already", () => {
    expect(
      responseToFormState({ ok: true, status: "already_confirmed" }, "x@y.com"),
    ).toEqual({ kind: "already" });
  });

  it("maps INVALID_EMAIL to a human-readable error (flat wire format: error string + code at top level)", () => {
    const state = responseToFormState(
      { error: "email shape", code: "INVALID_EMAIL" },
      "x",
    );
    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.message).toContain("doesn't look right");
    }
  });

  it("maps RATE_LIMITED to a throttle-specific message", () => {
    const state = responseToFormState(
      { error: "too many requests", code: "RATE_LIMITED" },
      "x@y.com",
    );
    expect(state.kind).toBe("error");
    if (state.kind === "error") expect(state.message).toMatch(/too many/i);
  });

  it("maps TURNSTILE_FAILED to a captcha message", () => {
    const state = responseToFormState(
      { error: "captcha no-token", code: "TURNSTILE_FAILED" },
      "x@y.com",
    );
    expect(state.kind).toBe("error");
    if (state.kind === "error") expect(state.message).toMatch(/captcha/i);
  });

  it("maps DELIVERY_QUEUED / DELIVERY_FATAL to an email-trouble message (legacy paths; soft-fail now returns ok=true)", () => {
    const queued = responseToFormState(
      { error: "upstream 503", code: "DELIVERY_QUEUED" },
      "x@y.com",
    );
    expect(queued.kind).toBe("error");
    if (queued.kind === "error")
      expect(queued.message).toMatch(/confirmation email/i);

    const fatal = responseToFormState(
      { error: "bad from", code: "DELIVERY_FATAL" },
      "x@y.com",
    );
    expect(fatal.kind).toBe("error");
    if (fatal.kind === "error")
      expect(fatal.message).toMatch(/confirmation email/i);
  });

  it("maps the soft-fail 202 ok=true delivery=deferred response to sent (current Resend-unverified path)", () => {
    const state = responseToFormState(
      { ok: true, status: "pending", delivery: "deferred" },
      "x@y.com",
    );
    expect(state).toEqual({ kind: "sent", email: "x@y.com" });
  });

  it("falls back to the unknown-code error message when an error code is unrecognised — uses response.error as the human message", () => {
    const state = responseToFormState(
      { error: "something exotic broke", code: "EXOTIC_ERROR" },
      "x@y.com",
    );
    expect(state.kind).toBe("error");
    if (state.kind === "error")
      expect(state.message).toBe("something exotic broke");
  });

  it("falls back to a generic error when the network dropped", () => {
    const state = responseToFormState(null, "x@y.com");
    expect(state.kind).toBe("error");
  });
});

describe("readSubscribeCookies", () => {
  it("returns false/false for missing header", () => {
    expect(readSubscribeCookies(null)).toEqual({
      hasSubscribed: false,
      hasDismissed: false,
    });
  });

  it("detects aip_subscribed", () => {
    expect(readSubscribeCookies("aip_subscribed=1")).toEqual({
      hasSubscribed: true,
      hasDismissed: false,
    });
  });

  it("detects aip_subscribe_dismissed alongside other cookies", () => {
    expect(
      readSubscribeCookies("aip_beta=1; aip_subscribe_dismissed=1; other=a"),
    ).toEqual({ hasSubscribed: false, hasDismissed: true });
  });
});
