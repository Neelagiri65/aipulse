import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { optionalEnv, requireEnv } from "@/lib/env";

describe("requireEnv", () => {
  const original = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = original;
    }
  });

  it("returns the value when set", () => {
    process.env.RESEND_API_KEY = "re_test_123";
    expect(requireEnv("RESEND_API_KEY")).toBe("re_test_123");
  });

  it("throws when unset", () => {
    delete process.env.RESEND_API_KEY;
    expect(() => requireEnv("RESEND_API_KEY")).toThrow(
      /missing required env var: RESEND_API_KEY/,
    );
  });

  it("throws on empty string (unset-equivalent)", () => {
    process.env.RESEND_API_KEY = "";
    expect(() => requireEnv("RESEND_API_KEY")).toThrow(
      /missing required env var/,
    );
  });
});

describe("optionalEnv", () => {
  const original = process.env.DMARC_RUA_EMAIL;

  beforeEach(() => {
    delete process.env.DMARC_RUA_EMAIL;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DMARC_RUA_EMAIL;
    } else {
      process.env.DMARC_RUA_EMAIL = original;
    }
  });

  it("returns undefined when unset", () => {
    expect(optionalEnv("DMARC_RUA_EMAIL")).toBeUndefined();
  });

  it("returns the value when set", () => {
    process.env.DMARC_RUA_EMAIL = "dmarc@example.com";
    expect(optionalEnv("DMARC_RUA_EMAIL")).toBe("dmarc@example.com");
  });

  it("returns undefined on empty string", () => {
    process.env.DMARC_RUA_EMAIL = "";
    expect(optionalEnv("DMARC_RUA_EMAIL")).toBeUndefined();
  });
});
