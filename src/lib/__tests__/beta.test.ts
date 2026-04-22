import { describe, expect, it } from "vitest";
import { BETA_COOKIE_NAME, hasCookie, isBetaEnabled } from "@/lib/beta";

describe("isBetaEnabled (post-Session-34: default-on)", () => {
  it("returns true when env flag is 'all'", () => {
    expect(isBetaEnabled({ envFlag: "all" })).toBe(true);
  });

  it("returns true when env flag is undefined (default-on)", () => {
    expect(isBetaEnabled({ envFlag: undefined })).toBe(true);
  });

  it("returns false when env flag is 'off' and no override signal", () => {
    expect(isBetaEnabled({ envFlag: "off" })).toBe(false);
  });

  it("treats ?beta=1 as a kill-switch override (force-on)", () => {
    expect(
      isBetaEnabled({ envFlag: "off", url: "https://aipulse.dev/?beta=1" }),
    ).toBe(true);
  });

  it("stays off when ?beta=1 is absent and env is 'off'", () => {
    expect(
      isBetaEnabled({ envFlag: "off", url: "https://aipulse.dev/?beta=0" }),
    ).toBe(false);
    expect(
      isBetaEnabled({ envFlag: "off", url: "https://aipulse.dev/" }),
    ).toBe(false);
  });

  it("treats the aip_beta cookie as a kill-switch override", () => {
    expect(
      isBetaEnabled({
        envFlag: "off",
        cookieHeader: `${BETA_COOKIE_NAME}=1; other=y`,
      }),
    ).toBe(true);
  });

  it("handles malformed URL gracefully (no throw, falls through to env)", () => {
    // env "off", malformed URL, no cookie → off
    expect(isBetaEnabled({ envFlag: "off", url: "not a url" })).toBe(false);
    // env undefined (default-on), malformed URL → on
    expect(isBetaEnabled({ url: "not a url" })).toBe(true);
  });
});

describe("hasCookie", () => {
  it("finds a cookie among several", () => {
    expect(hasCookie("a=1; b=2; aip_beta=1", "aip_beta")).toBe(true);
  });

  it("returns false when the cookie is absent", () => {
    expect(hasCookie("a=1; b=2", "aip_beta")).toBe(false);
  });

  it("matches only exact names (no prefix collision)", () => {
    expect(hasCookie("aip_betapretend=1", "aip_beta")).toBe(false);
  });
});
