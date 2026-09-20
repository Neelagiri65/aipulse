/**
 * The product wordmark is `gawk.dev`. Never `GAWK`.
 *
 * One subject: rendered strings in `src/` — not comments, which are allowed
 * (and required) to discuss the old form to explain why it is gone.
 *
 * This is not style drift, which is why it needs pinning. The uppercase form
 * was a DOCUMENTED rule: the Nativerse Brand Bible (~/nativerse-site/brand/
 * BRAND-BIBLE.md, line 106) said "Products keep exact casing: equiv
 * (lowercase), GAWK (uppercase)". That rule predates the rename. The founder
 * superseded it on 2026-09-07 — the name is `gawk.dev` everywhere, masthead
 * included — and the bible line has been annotated so it cannot be cited to
 * undo this. Without this test, anyone reading the bible would "restore" the
 * uppercase form in good faith, exactly as it survived the paper-palette
 * migration of DigestTileBoard.
 *
 * It shipped in the daily digest email masthead, the digest endorsement line,
 * the tool-health chart header and the report chart header — subscriber-facing
 * and unfurl-facing surfaces.
 *
 * Scope: every `.ts`/`.tsx` file under `src/`, with no exclusions.
 * `src/video/DailyBrief.tsx` was excluded while its fix was in flight (the
 * video overlay additionally applied textTransform:"uppercase", so the string
 * alone would still have rendered `GAWK.DEV`; it re-renders the daily video,
 * so it shipped as its own PR). That PR has landed, so the exclusion is gone
 * and the video overlay is guarded like every other surface.
 *
 * NOT in scope: `scripts/video/`, which is a build-time pipeline outside
 * `src/` and still carries the uppercase form in four places.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(process.cwd(), "src");

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      out.push(...filesUnder(full));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/** A comment line — `//`, or a block-comment body/opener/closer. */
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;
const UPPERCASE_WORDMARK = /\bGAWK\b/;

describe("the product wordmark", () => {
  const files = filesUnder(SRC);

  it("finds the files it is meant to guard", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith("lib/email/templates/digest.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("components/digest/DigestTileBoard.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("video/DailyBrief.tsx"))).toBe(true);
  });

  it("is never rendered as uppercase GAWK", () => {
    const offenders = files.flatMap((f) =>
      fs
        .readFileSync(f, "utf8")
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => !COMMENT.test(line) && UPPERCASE_WORDMARK.test(line))
        .map(({ line, n }) => `${path.relative(SRC, f)}:${n} — ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
