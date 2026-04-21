import { describe, expect, it } from "vitest";
import { BETA_COOKIE_NAME, hasCookie, isBetaEnabled } from "@/lib/beta";

describe("isBetaEnabled", () => {
  it("returns true when env flag is 'all'", () => {
    expect(isBetaEnabled({ envFlag: "all" })).toBe(true);
  });

  it("returns false when env flag is 'off' and no other signal", () => {
    expect(isBetaEnabled({ envFlag: "off" })).toBe(false);
  });

  it("returns true when ?beta=1 is on the URL", () => {
    expect(
      isBetaEnabled({ envFlag: "off", url: "https://aipulse.dev/?beta=1" }),
    ).toBe(true);
  });

  it("returns false for ?beta=0 or missing param", () => {
    expect(
      isBetaEnabled({ envFlag: "off", url: "https://aipulse.dev/?beta=0" }),
    ).toBe(false);
    expect(
      isBetaEnabled({ envFlag: "off", url: "https://aipulse.dev/" }),
    ).toBe(false);
  });

  it("returns true when the aip_beta cookie is present", () => {
    expect(
      isBetaEnabled({
        envFlag: "off",
        cookieHeader: `${BETA_COOKIE_NAME}=1; other=y`,
      }),
    ).toBe(true);
  });

  it("handles malformed URL gracefully (no throw, falls through)", () => {
    expect(isBetaEnabled({ envFlag: "off", url: "not a url" })).toBe(false);
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
