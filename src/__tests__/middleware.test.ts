import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { BETA_COOKIE_MAX_AGE_SEC, BETA_COOKIE_NAME } from "@/lib/beta";

function request(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

describe("middleware (beta cookie stamping)", () => {
  it("sets the aip_beta cookie when ?beta=1 is present", () => {
    const res = middleware(request("https://aipulse-pi.vercel.app/?beta=1"));
    const cookie = res.cookies.get(BETA_COOKIE_NAME);
    expect(cookie?.value).toBe("1");
    expect(cookie?.maxAge).toBe(BETA_COOKIE_MAX_AGE_SEC);
    expect(cookie?.path).toBe("/");
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.secure).toBe(true);
  });

  it("does not stamp the cookie when ?beta is absent", () => {
    const res = middleware(request("https://aipulse-pi.vercel.app/"));
    expect(res.cookies.get(BETA_COOKIE_NAME)).toBeUndefined();
  });

  it("does not stamp the cookie when ?beta has the wrong value", () => {
    const res = middleware(request("https://aipulse-pi.vercel.app/?beta=0"));
    expect(res.cookies.get(BETA_COOKIE_NAME)).toBeUndefined();
  });

  it("does not stamp when beta value is truthy-ish but not exactly '1'", () => {
    const res = middleware(
      request("https://aipulse-pi.vercel.app/?beta=true"),
    );
    expect(res.cookies.get(BETA_COOKIE_NAME)).toBeUndefined();
  });
});
