import { describe, expect, it } from "vitest";
import {
  extractLocation,
  hostFromUrl,
  isAiRelevant,
  KEYWORD_ALLOWLIST,
  DOMAIN_ALLOWLIST,
  SOFT_BLACKLIST,
} from "@/lib/data/wire-hn";

describe("isAiRelevant", () => {
  it("matches a strong keyword in the title", () => {
    expect(isAiRelevant("Show HN: I built X with Claude Code", "example.com"))
      .toBe(true);
  });

  it("rejects a title with no keyword and no domain match", () => {
    expect(isAiRelevant("How I refactored my monorepo", "example.com"))
      .toBe(false);
  });

  it("accepts via domain allowlist even when the title has no keyword", () => {
    expect(isAiRelevant("New paper on scaling laws", "arxiv.org")).toBe(true);
  });

  it("blacklist wins over a matching keyword", () => {
    expect(isAiRelevant("The Crypto LLM Pump", "x.com")).toBe(false);
  });

  it("blacklist catches AI-girlfriend noise", () => {
    expect(isAiRelevant("AI Girlfriend 2.0", "x.com")).toBe(false);
  });

  it("blacklist catches NSFW", () => {
    expect(isAiRelevant("NSFW LLM outputs leak", "x.com")).toBe(false);
  });

  it("returns false defensively on empty inputs", () => {
    expect(isAiRelevant("", "")).toBe(false);
  });

  it("is case-insensitive for title and host", () => {
    expect(isAiRelevant("CLAUDE 4.7 released", "X.COM")).toBe(true);
  });

  it("matches a domain suffix (subdomains included)", () => {
    expect(isAiRelevant("random title", "beta.huggingface.co")).toBe(true);
  });

  it("keyword match works inside punctuation / substrings", () => {
    // "AI safety" is a multi-word keyword; should still trigger.
    expect(isAiRelevant("On AI safety and alignment trade-offs", "example.com"))
      .toBe(true);
  });
});

describe("hostFromUrl", () => {
  it("lowercases and returns the host", () => {
    expect(hostFromUrl("https://Example.COM/path?q=1")).toBe("example.com");
  });

  it("returns empty string on null", () => {
    expect(hostFromUrl(null)).toBe("");
  });

  it("returns empty string on invalid URL", () => {
    expect(hostFromUrl("not a url")).toBe("");
  });

  it("handles bare hostnames without scheme via fallback", () => {
    // HN sometimes has story URLs missing scheme (rare). We handle them
    // as empty host — AI relevance falls back to keyword check.
    expect(hostFromUrl("example.com/path")).toBe("");
  });
});

describe("extractLocation", () => {
  it("returns null on null input", () => {
    expect(extractLocation(null)).toBeNull();
  });

  it("returns null on empty string", () => {
    expect(extractLocation("")).toBeNull();
  });

  it("strips HTML tags from the about field", () => {
    expect(
      extractLocation("<p>Building things in <b>Berlin, Germany</b></p>"),
    ).toBe("Building things in Berlin, Germany");
  });

  it("takes only the first non-empty line", () => {
    expect(extractLocation("San Francisco\nSoftware engineer")).toBe(
      "San Francisco",
    );
  });

  it("trims whitespace", () => {
    expect(extractLocation("  Tokyo  ")).toBe("Tokyo");
  });

  it("returns null when only HTML with no text", () => {
    expect(extractLocation("<br/><br/>")).toBeNull();
  });
});

describe("registry constants", () => {
  it("exports non-empty keyword allowlist", () => {
    expect(KEYWORD_ALLOWLIST.length).toBeGreaterThan(10);
    // Spot-check required terms from the PRD.
    expect(KEYWORD_ALLOWLIST).toContain("claude");
    expect(KEYWORD_ALLOWLIST).toContain("mcp");
    expect(KEYWORD_ALLOWLIST).toContain("rlhf");
  });

  it("exports non-empty domain allowlist", () => {
    expect(DOMAIN_ALLOWLIST.length).toBeGreaterThan(5);
    expect(DOMAIN_ALLOWLIST).toContain("arxiv.org");
    expect(DOMAIN_ALLOWLIST).toContain("huggingface.co");
  });

  it("exports soft blacklist with the three required terms", () => {
    expect(SOFT_BLACKLIST).toContain("crypto");
    expect(SOFT_BLACKLIST).toContain("girlfriend");
    expect(SOFT_BLACKLIST).toContain("nsfw");
  });
});
