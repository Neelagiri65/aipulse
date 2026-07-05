/**
 * Layer A trust — panel source-link surfaces (the "board/panel surface
 * untested" residual recorded in GAP-TABLE for benchmarks/agents).
 *
 * Two guards:
 * - agents: AgentsPanel builds its source link as
 *   `https://github.com/${githubRepo}` — a registry entry mistakenly
 *   holding a full URL ("https://github.com/x/y") would render the #53
 *   nested-host class (github.com/https://github.com/x/y). Pin every
 *   curated entry to bare owner/repo and the CONSTRUCTED url through
 *   checkResolvableSource.
 * - benchmarks: the panel's citable dataset link is read from the
 *   registry entry (LMARENA_LEADERBOARD.url) — pin that the entry's url
 *   itself is resolvable, so the wiring can't cite a malformed source
 *   (the HeroStrip-38 hardcode class is prevented by the import; this
 *   pins the imported value).
 */
import { describe, expect, it } from "vitest";

import { AGENT_FRAMEWORKS } from "@/lib/data/agents-registry";
import { LMARENA_LEADERBOARD } from "@/lib/data-sources";
import { checkResolvableSource } from "@/lib/trust/invariants";

const OWNER_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

describe("panel source links — A/V invariants", () => {
  it("every agents-registry githubRepo is bare owner/repo (never a URL — the #53 class)", () => {
    expect(AGENT_FRAMEWORKS.length).toBeGreaterThan(0);
    for (const f of AGENT_FRAMEWORKS) {
      expect
        .soft(OWNER_REPO_RE.test(f.githubRepo), `${f.id}: "${f.githubRepo}"`)
        .toBe(true);
      // The exact URL AgentsPanel constructs must be resolvable.
      expect
        .soft(
          checkResolvableSource(`https://github.com/${f.githubRepo}`),
          `${f.id} constructed URL`,
        )
        .toBeNull();
    }
  });

  it("the benchmarks panel's citable dataset link (registry entry) is resolvable", () => {
    expect(checkResolvableSource(LMARENA_LEADERBOARD.url)).toBeNull();
    expect(LMARENA_LEADERBOARD.url).toContain("lmarena-ai/leaderboard-dataset");
  });
});
