import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// runDepsDiscovery talks to Upstash, ecosyste.ms (global fetch) and the GitHub
// Contents API. Mock the side-effecting modules so we can drive the wall-clock
// budget deterministically. The budget guard (added after the 2026-06
// registry-discover-deps timeout incident) is the behaviour under test: when
// the clock passes the deadline mid-pass, the verification loop must stop and
// return partial progress with ok-shaped result — never run unbounded and get
// killed by the Vercel Hobby function ceiling.

vi.mock("@/lib/data/repo-registry", () => ({
  isRegistryAvailable: () => true,
  readAllEntries: vi.fn(async () => []),
  upsertEntries: vi.fn(async () => {}),
  writeMeta: vi.fn(async () => {}),
}));
const pathExists = vi.fn(async () => false);
vi.mock("@/lib/github", () => ({ pathExists: (...a: unknown[]) => pathExists(...(a as [])) }));
vi.mock("@/lib/data/config-verifier", () => ({
  verifyConfigFile: vi.fn(async () => ({ verified: false })),
}));
vi.mock("@/lib/data/owner-location", () => ({
  resolveOwnerLocation: vi.fn(async () => null),
}));

import { runDepsDiscovery } from "@/lib/data/registry-deps";

function stubEcosystemsFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => [
        {
          name: "widget",
          repository_url: "https://github.com/acme/widget",
          latest_release_published_at: "2026-06-01T00:00:00Z",
        },
      ],
    })),
  );
}

beforeEach(() => {
  process.env.GH_TOKEN = "test-token";
  pathExists.mockClear();
  stubEcosystemsFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GH_TOKEN;
});

describe("runDepsDiscovery wall-clock budget", () => {
  it("stops the verification pass and returns partial progress when the budget is exhausted", async () => {
    // Clock: first call seeds the deadline (t=0 → deadline 1000); the loop's
    // pre-candidate check then reads t=5000 > deadline → trips immediately.
    const ticks = [0, 5000, 5000, 5000];
    let i = 0;
    const now = () => ticks[Math.min(i++, ticks.length - 1)];

    const result = await runDepsDiscovery({
      source: "test",
      packages: ["openai"],
      pagesPerPackage: 1,
      timeBudgetMs: 1000,
      now,
    });

    expect(result.stoppedEarly).toBe(true);
    expect(result.verifiesAttempted).toBe(0);
    expect(result.written).toBe(0);
    expect(result.failures.some((f) => f.step === "time-budget")).toBe(true);
    // Budget tripped before any candidate was probed.
    expect(pathExists).not.toHaveBeenCalled();
  });

  it("does not trip the budget on a fast pass (clock never advances past deadline)", async () => {
    const now = () => 0; // never reaches the deadline

    const result = await runDepsDiscovery({
      source: "test",
      packages: ["openai"],
      pagesPerPackage: 1,
      timeBudgetMs: 40_000,
      now,
    });

    expect(result.stoppedEarly).toBe(false);
    // One fresh candidate was reached and probed (pathExists→false → skipped).
    expect(result.verifiesAttempted).toBe(1);
    expect(pathExists).toHaveBeenCalled();
    expect(result.failures.some((f) => f.step === "time-budget")).toBe(false);
  });
});
