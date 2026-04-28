import { describe, expect, it } from "vitest";
import { buildShareUrl, composeShareText } from "@/lib/email/share-urls";

describe("buildShareUrl — LinkedIn", () => {
  it("points at the official share-offsite endpoint", () => {
    const u = buildShareUrl({
      platform: "linkedin",
      url: "https://gawk.dev/digest/2026-04-22#tool-health",
      text: "ignored by LinkedIn",
    });
    expect(u.startsWith("https://www.linkedin.com/sharing/share-offsite/?")).toBe(
      true,
    );
  });

  it("URL-encodes the share URL", () => {
    const u = buildShareUrl({
      platform: "linkedin",
      url: "https://gawk.dev/digest/2026-04-22#tool-health",
      text: "",
    });
    expect(u).toContain(
      "url=https%3A%2F%2Fgawk.dev%2Fdigest%2F2026-04-22%23tool-health",
    );
  });
});

describe("buildShareUrl — X", () => {
  it("points at the intent/tweet endpoint with text and url", () => {
    const u = buildShareUrl({
      platform: "x",
      url: "https://gawk.dev/digest/2026-04-22#benchmarks",
      text: "Benchmarks: Claude 4 moved up one rank — via Gawk",
    });
    expect(u.startsWith("https://x.com/intent/tweet?")).toBe(true);
    expect(u).toContain(
      "url=https%3A%2F%2Fgawk.dev%2Fdigest%2F2026-04-22%23benchmarks",
    );
    expect(u).toContain(
      "text=Benchmarks%3A+Claude+4+moved+up+one+rank+%E2%80%94+via+Gawk",
    );
  });

  it("handles emoji/unicode in the text", () => {
    const u = buildShareUrl({
      platform: "x",
      url: "https://gawk.dev/digest/2026-04-22",
      text: "Δ 3 tool incidents today",
    });
    expect(u).toContain("text=");
    // Smoke: it parses as a URL without throwing.
    expect(() => new URL(u)).not.toThrow();
  });
});

describe("composeShareText", () => {
  it("joins title and headline with the Gawk byline", () => {
    expect(
      composeShareText("Benchmarks", "Claude 4 moved up one rank on LMArena"),
    ).toBe("Benchmarks: Claude 4 moved up one rank on LMArena — via Gawk");
  });
});
