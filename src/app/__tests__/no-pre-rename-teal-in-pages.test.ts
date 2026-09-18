/**
 * No page that renders on the paper ground may wear the pre-rename teal.
 *
 * One subject: `.tsx` files under `src/app`. The board was redesigned from a
 * dark ground to `--paper` #FAFAF6, and the old accent did not survive the
 * move — teal-300 `#5eead4` measures **1.41:1** on paper (it is 12.04:1 on the
 * dark ground it was chosen for). On 2026-09-18 that was still the colour of
 * the subhead and BOTH prose links on /newsletter and /digest — the subscribe
 * funnel — and of the glow on the brand lockup of /subscribe/confirm and
 * /subscribe/unsubscribed.
 *
 * Nothing failed, because nothing looked. The tokens are right there:
 * `text-muted-foreground` is 5.16:1 on paper and re-steps for dark.
 *
 * Scope, stated so this file cannot be mistaken for a clean bill:
 *   - `src/app/globals.css` still holds SIX `rgba(45, 212, 191, …)` rules
 *     (severity pill, mobile active subtab, mobile More header, map zoom
 *     hover, drawer spark). They are UI chrome, they need a design call on
 *     what replaces them, and they are deliberately NOT covered here.
 *   - `src/components` is out of scope too: some teal there is a legitimate
 *     CATEGORY hue (event-palette's PushEvent), not the brand accent.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.join(process.cwd(), "src/app");

function pagesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      out.push(...pagesUnder(full));
    } else if (e.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** Tailwind teal utilities and the raw accent — not the word "teal" in prose. */
const TEAL_CLASS = /\b(?:text|bg|border|from|to|via|ring|shadow|decoration|outline)-teal-\d{2,3}\b/;
const TEAL_LITERAL = /#2dd4bf\b|rgba\(\s*45\s*,\s*212\s*,\s*191/i;

describe("pages on the paper ground", () => {
  const files = pagesUnder(APP);

  it("finds the page files it claims to check", () => {
    // Without this the sweep below passes vacuously if the walk ever breaks.
    expect(files.length).toBeGreaterThan(20);
  });

  it("carry no pre-rename teal", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      src.split("\n").forEach((line, i) => {
        if (TEAL_CLASS.test(line) || TEAL_LITERAL.test(line)) {
          offenders.push(`${path.relative(process.cwd(), f)}:${i + 1} — ${line.trim().slice(0, 90)}`);
        }
      });
    }
    expect(offenders, `pre-rename teal is 1.41:1 on --paper:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});
