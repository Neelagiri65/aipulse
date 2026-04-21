import { describe, expect, it } from "vitest";
import { validateEmail } from "@/lib/email/validation";

describe("validateEmail", () => {
  it("accepts a normal address and returns a lowercased normalised form", () => {
    const r = validateEmail("User@Example.COM");
    expect(r).toEqual({ valid: true, normalised: "user@example.com" });
  });

  it("trims surrounding whitespace", () => {
    const r = validateEmail("  user@example.com  ");
    expect(r).toEqual({ valid: true, normalised: "user@example.com" });
  });

  it("rejects non-string inputs as empty", () => {
    expect(validateEmail(undefined)).toEqual({
      valid: false,
      reason: "empty",
    });
    expect(validateEmail(null)).toEqual({ valid: false, reason: "empty" });
    expect(validateEmail(42)).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects the empty string and whitespace-only", () => {
    expect(validateEmail("")).toEqual({ valid: false, reason: "empty" });
    expect(validateEmail("   ")).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects addresses over 254 chars as too-long", () => {
    const local = "a".repeat(250);
    const r = validateEmail(`${local}@example.com`);
    expect(r.valid).toBe(false);
    expect((r as { reason: string }).reason).toBe("too-long");
  });

  it("rejects addresses with no @", () => {
    expect(validateEmail("plainstring")).toEqual({
      valid: false,
      reason: "shape",
    });
  });

  it("rejects addresses with no domain TLD dot", () => {
    expect(validateEmail("user@localhost")).toEqual({
      valid: false,
      reason: "shape",
    });
  });

  it("rejects addresses with a space inside", () => {
    expect(validateEmail("user name@example.com")).toEqual({
      valid: false,
      reason: "shape",
    });
  });
});
