/**
 * Unit tests for the `?force=...` query param parser used by
 * /api/digest/send. The flag bypasses the once-per-day idempotency
 * guard — operator opt-in for partial-batch retries. Pinning the
 * accepted-truthy set explicitly so future copy edits in the GH
 * Actions workflow can't silently widen the bypass surface.
 */
import { describe, expect, it } from "vitest";
import { parseForceFlag } from "@/app/api/digest/send/route";

function req(url: string): Request {
  return new Request(url, { method: "POST" });
}

describe("parseForceFlag", () => {
  it("returns false when the param is absent", () => {
    expect(parseForceFlag(req("https://gawk.dev/api/digest/send"))).toBe(false);
  });

  it.each(["1", "true", "yes", "TRUE", "Yes", " 1 "])(
    "treats %j as truthy",
    (v) => {
      expect(
        parseForceFlag(
          req(`https://gawk.dev/api/digest/send?force=${encodeURIComponent(v)}`),
        ),
      ).toBe(true);
    },
  );

  it.each(["0", "false", "no", "", "FORCE", "y", "maybe"])(
    "treats %j as NOT truthy (default deny)",
    (v) => {
      expect(
        parseForceFlag(
          req(`https://gawk.dev/api/digest/send?force=${encodeURIComponent(v)}`),
        ),
      ).toBe(false);
    },
  );

  it("returns false when the URL fails to parse (defensive default)", () => {
    // Construct a Request whose .url is malformed by overriding via Proxy.
    const inner = req("https://gawk.dev/api/digest/send");
    const broken = new Proxy(inner, {
      get(target, prop) {
        if (prop === "url") return "://not a url";
        return Reflect.get(target, prop);
      },
    });
    expect(parseForceFlag(broken as Request)).toBe(false);
  });
});
