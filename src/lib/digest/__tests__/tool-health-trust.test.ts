import { describe, expect, it } from "vitest";

import { statusPageFor } from "@/lib/digest/sections/tool-health";

/**
 * Trust guard for the tool-health source links. The old fallback
 * `https://status.${toolId}.com/` fabricated dead domains
 * (status.codex.com, status.copilot.com — verified non-resolving) that
 * shipped LIVE in the 2026-07-05 digest — a source that doesn't exist is
 * an attribution-invariant breach. statusPageFor must return a REAL page
 * or undefined, never a constructed domain.
 */
describe("statusPageFor — no fabricated status domains", () => {
  it("known tools map to their REAL verified status pages", () => {
    expect(statusPageFor("claude-code")).toBe("https://status.claude.com/");
    expect(statusPageFor("codex")).toBe("https://status.openai.com/");
    expect(statusPageFor("copilot")).toBe("https://www.githubstatus.com/");
    expect(statusPageFor("windsurf")).toBe("https://status.windsurf.com/");
  });

  it("an UNKNOWN tool returns undefined — never fabricates status.{id}.com", () => {
    for (const id of ["codex-next", "some-new-tool", "xyz"]) {
      const url = statusPageFor(id);
      expect(url).toBeUndefined();
    }
  });

  it("the previously-fabricated ids now resolve to REAL pages, not status.{id}.com", () => {
    // These 4 were the live-shipped fabrications; each now maps to a real host.
    expect(statusPageFor("codex")).not.toContain("status.codex.com");
    expect(statusPageFor("copilot")).not.toContain("status.copilot.com");
    expect(statusPageFor("claude-code")).not.toContain("status.claude-code.com");
  });
});
