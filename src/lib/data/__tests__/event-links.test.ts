import { describe, expect, it } from "vitest";

import {
  actorHref,
  actorLabel,
  repoHref,
} from "@/lib/data/event-links";

describe("repoHref — platform-aware (the 404 fix)", () => {
  it("GitHub bare name → github.com", () => {
    expect(repoHref("gitlab-org/gitlab")).toBe("https://github.com/gitlab-org/gitlab");
    expect(repoHref("Neelagiri65/aipulse")).toBe("https://github.com/Neelagiri65/aipulse");
  });
  it("GitLab namespaced name → gitlab.com, NOT github.com/gitlab.com/... (the bug)", () => {
    expect(repoHref("gitlab.com/gitlab-org/gitlab-runner")).toBe(
      "https://gitlab.com/gitlab-org/gitlab-runner",
    );
    expect(repoHref("gitlab.com/inkscape/inkscape")).not.toContain("github.com");
  });
  it("absent → undefined", () => {
    expect(repoHref(undefined)).toBeUndefined();
    expect(repoHref(null)).toBeUndefined();
  });
});

describe("actorHref / actorLabel — gl: namespace", () => {
  it("GitLab login links to gitlab.com and strips the prefix for display", () => {
    expect(actorHref("gl:aleksandr-kotlyar")).toBe("https://gitlab.com/aleksandr-kotlyar");
    expect(actorLabel("gl:aleksandr-kotlyar")).toBe("aleksandr-kotlyar");
  });
  it("GitHub login unchanged", () => {
    expect(actorHref("torvalds")).toBe("https://github.com/torvalds");
    expect(actorLabel("torvalds")).toBe("torvalds");
  });
});
