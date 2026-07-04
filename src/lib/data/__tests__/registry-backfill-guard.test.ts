import { describe, expect, it } from "vitest";

import { collapseCandidates } from "@/lib/data/registry-events-backfill";

const T = "2026-07-05T00:00:00.000Z";

describe("collapseCandidates — GitLab guard (plan §5.1)", () => {
  it("a mixed buffer yields ONLY GitHub candidates — all three fences hold", () => {
    const out = collapseCandidates([
      // Real GitHub events -> candidates.
      { eventAt: T, eventId: "111", sourceKind: "events-api", meta: { repo: "owner/repo-a" } },
      { eventAt: T, eventId: "112", sourceKind: "tracked-repo", meta: { repo: "Neelagiri65/aipulse" } },
      // Fence 1: sourceKind.
      { eventAt: T, eventId: "113", sourceKind: "gitlab", meta: { repo: "inkscape/inkscape" } },
      // Fence 2: gl: id namespace (even if sourceKind were lost).
      { eventAt: T, eventId: "gl:999", meta: { repo: "wireshark/wireshark" } },
      // Fence 3: gitlab.com/ repo prefix (even if both above were lost).
      { eventAt: T, eventId: "114", meta: { repo: "gitlab.com/graphviz/graphviz" } },
    ]);
    expect(Array.from(out.keys()).sort()).toEqual([
      "Neelagiri65/aipulse",
      "owner/repo-a",
    ]);
  });

  it("cross-platform name collision cannot leak: gitlab inkscape never candidates the GitHub mirror", () => {
    const out = collapseCandidates([
      { eventAt: T, eventId: "gl:5", sourceKind: "gitlab", meta: { repo: "gitlab.com/inkscape/inkscape" } },
    ]);
    expect(out.size).toBe(0);
  });
});
