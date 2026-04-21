import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  applyGpc,
  clearConsentCookie,
  CONSENT_COOKIE,
  isGpcSet,
  readConsentCookie,
  readVisitorId,
  setConsentCookie,
  setVisitorCookie,
  VISITOR_COOKIE,
} from "@/lib/consent-cookies";

function headers(values: Record<string, string>): { get(name: string): string | null } {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) lower[k.toLowerCase()] = v;
  return { get: (n) => lower[n.toLowerCase()] ?? null };
}

describe("readVisitorId", () => {
  it("returns the visitor id when the cookie is present", () => {
    expect(readVisitorId(`${VISITOR_COOKIE}=abc-123; other=x`)).toBe("abc-123");
  });

  it("returns null when cookie header is missing or empty", () => {
    expect(readVisitorId(null)).toBeNull();
    expect(readVisitorId("")).toBeNull();
  });

  it("returns null when the named cookie is absent", () => {
    expect(readVisitorId("other=x; another=y")).toBeNull();
  });

  it("ignores a cookie with an exact-but-empty value", () => {
    expect(readVisitorId(`${VISITOR_COOKIE}=`)).toBeNull();
  });

  it("decodes URL-escaped values", () => {
    expect(readVisitorId(`${VISITOR_COOKIE}=a%2Fb`)).toBe("a/b");
  });
});

describe("readConsentCookie", () => {
  it("returns the parsed categories when the JSON is well-formed", () => {
    const raw = encodeURIComponent(
      JSON.stringify({ necessary: true, analytics: true, marketing: false }),
    );
    expect(readConsentCookie(`${CONSENT_COOKIE}=${raw}`)).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
    });
  });

  it("returns null on malformed JSON", () => {
    expect(readConsentCookie(`${CONSENT_COOKIE}=not-json`)).toBeNull();
  });

  it("returns null when categories are missing or wrong types", () => {
    const raw = encodeURIComponent(
      JSON.stringify({ necessary: true, analytics: "yes" }),
    );
    expect(readConsentCookie(`${CONSENT_COOKIE}=${raw}`)).toBeNull();
  });

  it("returns null when the cookie is absent", () => {
    expect(readConsentCookie(null)).toBeNull();
    expect(readConsentCookie("other=x")).toBeNull();
  });
});

describe("isGpcSet", () => {
  it("returns true when Sec-GPC header is 1", () => {
    expect(isGpcSet(headers({ "sec-gpc": "1" }))).toBe(true);
  });

  it("returns false for any other value or absent header", () => {
    expect(isGpcSet(headers({ "sec-gpc": "0" }))).toBe(false);
    expect(isGpcSet(headers({ "sec-gpc": "true" }))).toBe(false);
    expect(isGpcSet(headers({}))).toBe(false);
  });
});

describe("applyGpc", () => {
  it("returns input unchanged when gpc is false", () => {
    const input = { necessary: true as const, analytics: true, marketing: true };
    expect(applyGpc(input, false)).toEqual(input);
  });

  it("forces analytics + marketing to false when gpc is true", () => {
    const input = { necessary: true as const, analytics: true, marketing: true };
    expect(applyGpc(input, true)).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });
});

describe("setVisitorCookie / setConsentCookie / clearConsentCookie", () => {
  it("setVisitorCookie sets an HttpOnly cookie with the given id", () => {
    const resp = NextResponse.json({});
    setVisitorCookie(resp, "v-1");
    const header = resp.headers.get("set-cookie") ?? "";
    expect(header).toContain(`${VISITOR_COOKIE}=v-1`);
    expect(header.toLowerCase()).toContain("httponly");
  });

  it("setConsentCookie sets a NON-HttpOnly JSON cookie the client can read", () => {
    const resp = NextResponse.json({});
    setConsentCookie(resp, {
      necessary: true,
      analytics: true,
      marketing: false,
    });
    const header = resp.headers.get("set-cookie") ?? "";
    expect(header).toContain(CONSENT_COOKIE);
    expect(header.toLowerCase()).not.toContain("httponly");
  });

  it("clearConsentCookie writes a zero-maxAge expiry on the cookie", () => {
    const resp = NextResponse.json({});
    clearConsentCookie(resp);
    const header = resp.headers.get("set-cookie") ?? "";
    expect(header).toContain(`${CONSENT_COOKIE}=`);
    expect(header.toLowerCase()).toMatch(/max-age=0/);
  });
});
