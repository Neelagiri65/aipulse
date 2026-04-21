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

  it("maps INVALID_EMAIL to a human-readable error", () => {
    const state = responseToFormState(
      { ok: false, error: { code: "INVALID_EMAIL", message: "email shape" } },
      "x",
    );
    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.message).toContain("doesn't look right");
    }
  });

  it("maps RATE_LIMITED to a throttle-specific message", () => {
    const state = responseToFormState(
      { ok: false, error: { code: "RATE_LIMITED" } },
      "x@y.com",
    );
    expect(state.kind).toBe("error");
    if (state.kind === "error") expect(state.message).toMatch(/too many/i);
  });

  it("maps DELIVERY_QUEUED to an email-trouble message", () => {
    const state = responseToFormState(
      { ok: false, error: { code: "DELIVERY_QUEUED" } },
      "x@y.com",
    );
    expect(state.kind).toBe("error");
    if (state.kind === "error")
      expect(state.message).toMatch(/confirmation email/i);
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
