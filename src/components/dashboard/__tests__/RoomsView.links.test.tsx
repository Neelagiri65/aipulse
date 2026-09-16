/**
 * The rooms list links a repo name that came from the events payload, and that
 * payload carries two platforms in one field: GitHub events store `owner/repo`,
 * GitLab events store `gitlab.com/{path}`. The list filtered on `kind === "gh"`
 * and built `https://github.com/${repo}` — but GitLab events ARE kind "gh"
 * (`WirePage.tsx` tells them apart by the prefix, not the kind), so a GitLab
 * room would have linked to `https://github.com/gitlab.com/...` — a 404.
 *
 * Latent, not live: a room needs `hasAiConfig`, and the config probe only asks
 * api.github.com, so no GitLab repo earns the flag today (measured 2026-09-16:
 * 603 GitLab repos in the live window, 0 with the flag). This pins the
 * behaviour before that changes rather than after.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RoomsView } from "@/components/dashboard/RoomsView";

const row = (repo: string) => ({
  kind: "gh" as const,
  eventId: `e-${repo}`,
  type: "PushEvent",
  actor: "someone",
  repo,
  createdAt: "2026-09-16T10:00:00.000Z",
  hasAiConfig: true,
});

function render(repo: string): string {
  return renderToStaticMarkup(
    <RoomsView
      rows={[row(repo)]}
      polledAt="2026-09-16T10:01:00.000Z"
      windowMinutes={60}
    />,
  );
}

describe("RoomsView — the room's link reads the platform out of the name", () => {
  it("sends a GitLab room to gitlab.com, not github.com/gitlab.com/…", () => {
    const html = render("gitlab.com/gitlab-org/gitaly");
    expect(html).toContain('href="https://gitlab.com/gitlab-org/gitaly"');
    expect(html).not.toContain("github.com/gitlab.com");
  });

  it("leaves a GitHub room exactly where it was", () => {
    const html = render("anthropics/claude-code");
    expect(html).toContain('href="https://github.com/anthropics/claude-code"');
  });
});
