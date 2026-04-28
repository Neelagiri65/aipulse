import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { BETA_COOKIE_MAX_AGE_SEC, BETA_COOKIE_NAME } from "@/lib/beta";

function request(
  url: string,
  init: { headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(new URL(url), {
    headers: init.headers,
  });
}

function basicHeader(user: string, pass: string): string {
  const b64 = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return `Basic ${b64}`;
}

describe("middleware (beta cookie stamping)", () => {
  it("sets the aip_beta cookie when ?beta=1 is present", () => {
    const res = middleware(request("https://gawk.dev/?beta=1"));
    const cookie = res.cookies.get(BETA_COOKIE_NAME);
    expect(cookie?.value).toBe("1");
    expect(cookie?.maxAge).toBe(BETA_COOKIE_MAX_AGE_SEC);
    expect(cookie?.path).toBe("/");
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.secure).toBe(true);
  });

  it("does not stamp the cookie when ?beta is absent", () => {
    const res = middleware(request("https://gawk.dev/"));
    expect(res.cookies.get(BETA_COOKIE_NAME)).toBeUndefined();
  });

  it("does not stamp the cookie when ?beta has the wrong value", () => {
    const res = middleware(request("https://gawk.dev/?beta=0"));
    expect(res.cookies.get(BETA_COOKIE_NAME)).toBeUndefined();
  });

  it("does not stamp when beta value is truthy-ish but not exactly '1'", () => {
    const res = middleware(
      request("https://gawk.dev/?beta=true"),
    );
    expect(res.cookies.get(BETA_COOKIE_NAME)).toBeUndefined();
  });
});

describe("middleware (/admin basic-auth gate)", () => {
  const origUser = process.env.ADMIN_PREVIEW_USER;
  const origPass = process.env.ADMIN_PREVIEW_PASS;

  beforeEach(() => {
    process.env.ADMIN_PREVIEW_USER = "ops";
    process.env.ADMIN_PREVIEW_PASS = "s3cret";
  });

  afterEach(() => {
    process.env.ADMIN_PREVIEW_USER = origUser;
    process.env.ADMIN_PREVIEW_PASS = origPass;
  });

  it("returns 401 with WWW-Authenticate when header is missing", () => {
    const res = middleware(request("https://gawk.dev/admin/digest/preview"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic realm=");
  });

  it("returns 401 when credentials don't match", () => {
    const res = middleware(
      request("https://gawk.dev/admin/digest/preview", {
        headers: { authorization: basicHeader("ops", "wrong") },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("passes through when credentials match", () => {
    const res = middleware(
      request("https://gawk.dev/admin/digest/preview", {
        headers: { authorization: basicHeader("ops", "s3cret") },
      }),
    );
    // A NextResponse.next() passes control down; it returns 200-ish
    // with no body. The critical bit is that it's NOT 401.
    expect(res.status).not.toBe(401);
  });

  it("returns 401 when admin env vars are not configured", () => {
    delete process.env.ADMIN_PREVIEW_USER;
    delete process.env.ADMIN_PREVIEW_PASS;
    const res = middleware(
      request("https://gawk.dev/admin/digest/preview", {
        headers: { authorization: basicHeader("anyone", "anything") },
      }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic realm=");
  });

  it("does not gate non-/admin paths", () => {
    const res = middleware(
      request("https://gawk.dev/digest/2026-04-22"),
    );
    expect(res.status).not.toBe(401);
  });
});
