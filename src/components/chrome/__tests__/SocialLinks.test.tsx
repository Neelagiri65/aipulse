/**
 * SocialLinks — render contract for the "gawk.dev elsewhere" footer row:
 * named nav landmark, six profiles in a fixed order, each an accessible
 * external link with rel="noopener me", and every icon file present on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SOCIAL_LINKS, SocialLinks } from "@/components/chrome/SocialLinks";

describe("SocialLinks", () => {
  const html = renderToStaticMarkup(<SocialLinks />);

  it("renders a named nav landmark", () => {
    expect(html).toContain('<nav aria-label="gawk.dev elsewhere"');
  });

  it("lists the six profiles in order", () => {
    expect(SOCIAL_LINKS.map((s) => s.label)).toEqual([
      "LinkedIn",
      "YouTube",
      "GitHub",
      "DEV Community",
      "Substack",
      "Medium",
    ]);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(SOCIAL_LINKS.map((s) => s.href));
  });

  it("gives every link aria-label, title, target=_blank and rel=noopener me", () => {
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    expect(anchors).toHaveLength(6);
    for (const a of anchors) {
      expect(a).toMatch(/aria-label="gawk\.dev on [^"]+"/);
      expect(a).toMatch(/title="[^"]+"/);
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener me"');
    }
  });

  it("ships every icon as a script-free SVG in public/social", () => {
    for (const s of SOCIAL_LINKS) {
      const p = join(process.cwd(), "public", "social", `${s.icon}.svg`);
      expect(existsSync(p), p).toBe(true);
      const svg = readFileSync(p, "utf8");
      expect(svg).not.toMatch(/<script/i);
      expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });
});
