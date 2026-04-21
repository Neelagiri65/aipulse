import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  parseBasicAuth,
  requireAdminBasicAuth,
  verifyAdminBasicAuth,
} from "@/lib/digest/admin-auth";

function basic(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

describe("parseBasicAuth", () => {
  it("decodes a valid Basic header", () => {
    expect(parseBasicAuth(basic("admin", "hunter2"))).toEqual({
      user: "admin",
      pass: "hunter2",
    });
  });

  it("returns null for missing header", () => {
    expect(parseBasicAuth(null)).toBeNull();
    expect(parseBasicAuth(undefined)).toBeNull();
    expect(parseBasicAuth("")).toBeNull();
  });

  it("returns null for non-Basic scheme", () => {
    expect(parseBasicAuth("Bearer xyz")).toBeNull();
  });

  it("returns null when decoded has no colon", () => {
    const noColon = Buffer.from("just-a-token", "utf8").toString("base64");
    expect(parseBasicAuth(`Basic ${noColon}`)).toBeNull();
  });

  it("handles passwords containing a colon", () => {
    expect(parseBasicAuth(basic("admin", "a:b:c"))).toEqual({
      user: "admin",
      pass: "a:b:c",
    });
  });
});

describe("constantTimeEqual", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });

  it("returns false without throwing on length mismatch", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "x")).toBe(false);
  });
});

describe("verifyAdminBasicAuth", () => {
  const creds = { user: "admin", pass: "secret" };

  it("passes when header matches creds exactly", () => {
    expect(verifyAdminBasicAuth(basic("admin", "secret"), creds)).toBe(true);
  });

  it("fails when user is wrong", () => {
    expect(verifyAdminBasicAuth(basic("root", "secret"), creds)).toBe(false);
  });

  it("fails when pass is wrong", () => {
    expect(verifyAdminBasicAuth(basic("admin", "wrong"), creds)).toBe(false);
  });

  it("fails when header is missing", () => {
    expect(verifyAdminBasicAuth(null, creds)).toBe(false);
  });
});

describe("requireAdminBasicAuth", () => {
  const creds = { user: "admin", pass: "secret" };

  it("returns null (pass-through) when creds match", () => {
    expect(requireAdminBasicAuth(basic("admin", "secret"), { creds })).toBeNull();
  });

  it("returns 401 when creds mismatch", async () => {
    const resp = requireAdminBasicAuth(basic("admin", "wrong"), { creds });
    expect(resp).toBeInstanceOf(Response);
    expect(resp!.status).toBe(401);
    expect(resp!.headers.get("www-authenticate")).toBe(
      'Basic realm="AI Pulse admin"',
    );
  });

  it("returns 401 when header is absent", () => {
    const resp = requireAdminBasicAuth(null, { creds });
    expect(resp!.status).toBe(401);
  });

  it("returns 401 when env is unconfigured (creds undefined)", () => {
    const resp = requireAdminBasicAuth(basic("admin", "secret"), { creds: undefined });
    // When creds arg is undefined we fall through to loadCreds(). If the
    // env is unset in the test harness, the route blocks.
    expect(resp).toBeInstanceOf(Response);
    expect(resp!.status).toBe(401);
  });

  it("cache-controls the 401 response", () => {
    const resp = requireAdminBasicAuth(null, { creds });
    expect(resp!.headers.get("cache-control")).toBe("no-store");
  });
});
