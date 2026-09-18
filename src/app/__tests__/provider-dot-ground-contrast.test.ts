/**
 * The Model Usage row anchor (`.provider-dot`) must be legible on the ground
 * it ships on — in BOTH themes.
 *
 * This file has one subject: that dot. It exists because of what shipped
 * before it. Fourteen `.provider-dot-<vendor>` rules carried hardcoded
 * Tailwind 400s, chosen when the board was dark and never re-stepped when it
 * became warm paper. Measured 2026-09-18: 14 of 14 sat between 1.44:1 and
 * 2.64:1 on `--paper` (3:1 is the WCAG minimum for a non-text mark) while all
 * 14 passed on the dark ground. The neutral fallback measured 1.29:1 under a
 * comment promising it was "still visually present, just grey".
 *
 * Nothing checked any of it, so nothing failed for four months. These
 * assertions read the shipping stylesheet and do the arithmetic, so a colour
 * that is illegible on its own background cannot pass again — including via a
 * future re-step of `--ink-muted` itself.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CSS = fs.readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

/** WCAG relative luminance + contrast ratio, on hex only. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Read a custom property out of one theme scope. The light values live in
 * `:root`, the dark ones in the first `[data-theme="dark"]` block — reading
 * the whole file would let a light value satisfy a dark assertion.
 */
function tokenIn(scope: "light" | "dark", name: string): string {
  const start =
    scope === "light"
      ? CSS.indexOf(":root {")
      : CSS.indexOf('[data-theme="dark"] {');
  expect(start, `${scope} scope not found in globals.css`).toBeGreaterThan(-1);
  const block = CSS.slice(start, CSS.indexOf("\n}", start));
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  expect(m, `${name} not declared as a hex in the ${scope} scope`).not.toBeNull();
  return m![1];
}

/** The dot rule itself, so the assertions below cannot pass vacuously. */
const DOT_RULE = CSS.match(/\.provider-dot\s*\{[^}]*\}/);

describe("the Model Usage row anchor", () => {
  it("still exists as a rule — the checks below assert about something", () => {
    expect(DOT_RULE).not.toBeNull();
  });

  it("takes its fill from a themed token, not a hardcoded colour", () => {
    // A literal here is the exact shape of the original bug: one value for a
    // board that has two grounds.
    expect(DOT_RULE![0]).toContain("background: var(--ink-muted)");
    expect(DOT_RULE![0]).not.toMatch(/background:\s*(#|rgb)/);
  });

  it.each([["light"], ["dark"]] as const)(
    "clears 3:1 against its own ground in %s",
    (scope) => {
      const ratio = contrast(tokenIn(scope, "--ink-muted"), tokenIn(scope, "--paper"));
      expect(ratio, `--ink-muted on --paper in ${scope} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    },
  );

  it("declares no per-vendor colour variant", () => {
    // Fourteen mutually distinguishable hues do not exist: at eight slots the
    // worst pair sits at normal-vision ΔE 7.1 against a floor of 15. A
    // `.provider-dot-<vendor>` rule reappearing means the colour code came
    // back, legible or not. The comment above the rule mentions the old class
    // name, so match declarations only.
    const variants = CSS.match(/^\s*\.provider-dot-[a-z]+\s*\{/gm) ?? [];
    expect(variants).toEqual([]);
  });
});
