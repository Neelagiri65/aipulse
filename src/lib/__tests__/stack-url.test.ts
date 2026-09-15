import { describe, expect, it } from "vitest";
import { sameStack, shareUrlFor, stackFromParam } from "@/lib/stack-url";

describe("stackFromParam — the URL proposes only known tools, in its own order", () => {
  it("parses a comma list, drops junk, dedupes, keeps order", () => {
    expect(stackFromParam("cursor,foo,copilot,cursor")).toEqual(["cursor", "copilot"]);
    expect(stackFromParam(" copilot , claude-code ")).toEqual(["copilot", "claude-code"]);
  });
  it.each(["", null, undefined, "foo", ",,", "foo,bar"])("%s → null", (raw) => {
    expect(stackFromParam(raw as string | null)).toBeNull();
  });
});

describe("sameStack — set equality", () => {
  it("ignores order, respects membership and length", () => {
    expect(sameStack(["cursor", "copilot"], ["copilot", "cursor"])).toBe(true);
    expect(sameStack(["cursor"], ["cursor", "copilot"])).toBe(false);
    expect(sameStack(["cursor"], ["copilot"])).toBe(false);
  });
  it("null equals null and nothing else", () => {
    expect(sameStack(null, null)).toBe(true);
    expect(sameStack(null, ["cursor"])).toBe(false);
    expect(sameStack(["cursor"], null)).toBe(false);
  });
});

describe("shareUrlFor — origin + /?stack=, nothing else", () => {
  it("builds the link in the visitor's order and tolerates a trailing slash on the origin", () => {
    expect(shareUrlFor(["cursor", "copilot"], "https://gawk.dev")).toBe("https://gawk.dev/?stack=cursor,copilot");
    expect(shareUrlFor(["windsurf"], "https://gawk.dev/")).toBe("https://gawk.dev/?stack=windsurf");
  });
});
