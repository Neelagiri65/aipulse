/**
 * Unit tests for the HuggingFace fetch helpers.
 *
 * Scope (S62g.9): only the auth-header plumbing — `hfRequestHeaders`.
 * The full fetch round-trip is covered by the existing snapshot +
 * NEW_RELEASE deriver test surfaces.
 *
 * Why focused: the value of the change is "auth gets sent when env
 * is set, doesn't get sent when env is unset, no other behavior
 * changes." That's pure-function territory — exhaustive testing of
 * the pure helper gives the contract guarantee without spinning up
 * MSW or a fetch mock.
 */
import { afterEach, describe, expect, it } from "vitest";
import { hfRequestHeaders } from "@/lib/data/fetch-models";

const ORIGINAL_TOKEN = process.env.HF_TOKEN;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.HF_TOKEN;
  } else {
    process.env.HF_TOKEN = ORIGINAL_TOKEN;
  }
});

describe("hfRequestHeaders", () => {
  it("always includes Accept: application/json", () => {
    delete process.env.HF_TOKEN;
    const h = hfRequestHeaders();
    expect(h.Accept).toBe("application/json");
  });

  it("OMITS Authorization when HF_TOKEN env is unset (preserves unauth fallback)", () => {
    delete process.env.HF_TOKEN;
    const h = hfRequestHeaders();
    expect(h.Authorization).toBeUndefined();
    // Header object only has Accept.
    expect(Object.keys(h).sort()).toEqual(["Accept"]);
  });

  it("OMITS Authorization when HF_TOKEN is the empty string (treated as unset)", () => {
    process.env.HF_TOKEN = "";
    const h = hfRequestHeaders();
    expect(h.Authorization).toBeUndefined();
  });

  it("includes Authorization: Bearer <token> when HF_TOKEN is set", () => {
    process.env.HF_TOKEN = "hf_test_token_value_xyz";
    const h = hfRequestHeaders();
    expect(h.Authorization).toBe("Bearer hf_test_token_value_xyz");
    expect(h.Accept).toBe("application/json");
  });

  it("reads HF_TOKEN fresh on each call (env rotation picked up without restart)", () => {
    process.env.HF_TOKEN = "first_token";
    const h1 = hfRequestHeaders();
    expect(h1.Authorization).toBe("Bearer first_token");
    process.env.HF_TOKEN = "rotated_token";
    const h2 = hfRequestHeaders();
    expect(h2.Authorization).toBe("Bearer rotated_token");
  });

  it("does not echo the token anywhere except the Authorization header value", () => {
    process.env.HF_TOKEN = "secret_xyz";
    const h = hfRequestHeaders();
    // Token MUST appear ONLY as the Bearer-prefixed value of Authorization.
    // Stringify the whole object and assert exactly one occurrence.
    const occurrences = (JSON.stringify(h).match(/secret_xyz/g) ?? []).length;
    expect(occurrences).toBe(1);
    expect(h.Authorization).toContain("secret_xyz");
  });
});
