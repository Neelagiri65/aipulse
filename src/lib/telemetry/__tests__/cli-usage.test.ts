import { describe, expect, it } from "vitest";

import { classifyAgent, endpointLabel, hashClient, usageKeys } from "../cli-usage";

describe("classifyAgent — only the CLI is ever counted", () => {
  it("matches the CLI's exact and versioned user agents", () => {
    expect(classifyAgent("gawk-cli")).toBe("gawk-cli");
    expect(classifyAgent("gawk-cli/0.1.0")).toBe("gawk-cli");
  });

  it("ignores browsers, our own archiver, bots, and absent agents", () => {
    expect(classifyAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBeNull();
    expect(classifyAgent("gawk-data-archiver")).toBeNull();
    expect(classifyAgent("curl/8.6.0")).toBeNull();
    expect(classifyAgent("gawk-cli-imposter")).toBeNull();
    expect(classifyAgent(null)).toBeNull();
    expect(classifyAgent("")).toBeNull();
  });
});

describe("endpointLabel — command-mix buckets match CLI commands", () => {
  it("maps the four public endpoints to their CLI command names", () => {
    expect(endpointLabel("/api/feed")).toBe("wire");
    expect(endpointLabel("/api/v1/models")).toBe("models");
    expect(endpointLabel("/api/v1/sdk")).toBe("sdk");
    expect(endpointLabel("/api/v1/status")).toBe("tools");
  });

  it("sanitises unknown paths instead of dropping them", () => {
    expect(endpointLabel("/api/v1/agents")).toBe("v1/agents");
    expect(endpointLabel("/api/weird$$path")).toBe("weirdpath");
  });
});

describe("usageKeys — UTC day-keyed", () => {
  it("derives the UTC day from the ISO instant", () => {
    expect(usageKeys("2026-07-06T23:59:59.000Z", "wire")).toEqual({
      day: "2026-07-06",
      dau: "cli:dau:2026-07-06",
      reqs: "cli:reqs:wire:2026-07-06",
    });
  });
});

describe("hashClient — anonymisation properties", () => {
  it("is deterministic for the same client on the same day (HLL needs stability)", () => {
    expect(hashClient("203.0.113.7", "2026-07-06")).toBe(hashClient("203.0.113.7", "2026-07-06"));
  });

  it("differs across days (no cross-day linkage) and across clients", () => {
    expect(hashClient("203.0.113.7", "2026-07-06")).not.toBe(hashClient("203.0.113.7", "2026-07-07"));
    expect(hashClient("203.0.113.7", "2026-07-06")).not.toBe(hashClient("203.0.113.8", "2026-07-06"));
  });

  it("never contains the raw IP and is a fixed-width hex digest", () => {
    const h = hashClient("203.0.113.7", "2026-07-06");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).not.toContain("203.0.113.7");
  });
});
