import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Next's SWC drops the leading space of a JSX text run that contains an HTML entity:
//   `{m} from the source&apos;s words` → children [m, "from the source's words"]
// (isolated 2026-09-26 with next/dist/build/swc: the same run without the entity keeps " from").
// It shipped as "gpt-oss-20bfrom", "underrepresentedin", "52curated". Unit renders don't use SWC,
// so only a source scan catches it. Rule: a text run that follows `}` or `>` with a space on the
// same line must not contain an entity — put the space in {" "} or the text in one string.
const ENTITY = /&(?:[a-z]+|#[0-9]+);/g;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

export function spaceLosingRuns(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(ENTITY)) {
    let i = (m.index ?? 0) - 1;
    while (i >= 0 && !"{}<>".includes(src[i])) i--;
    if (i < 0 || !"}>".includes(src[i])) continue;
    const firstLine = src.slice(i + 1, m.index).split("\n")[0];
    if (/^ +\S/.test(firstLine)) out.push(src.slice(i, (m.index ?? 0) + m[0].length).replace(/\n\s*/g, " "));
  }
  return out;
}

describe("JSX text with an entity keeps its leading space", () => {
  it("the detector flags the three shapes that shipped, and not the {\" \"} form", () => {
    expect(spaceLosingRuns("<p>Written by {m} from the source&apos;s words</p>")).toHaveLength(1);
    expect(spaceLosingRuns("<strong>x</strong> in the view\n they don&rsquo;t")).toHaveLength(1);
    expect(spaceLosingRuns("plus {n} curated labs\n how often it&rsquo;s polled")).toHaveLength(1);
    expect(spaceLosingRuns('plus {n}{" "}\n curated labs, it&rsquo;s polled')).toHaveLength(0);
    expect(spaceLosingRuns("<p>\n  They don&rsquo;t</p>")).toHaveLength(0);
  });

  it("no .tsx under src has a space-losing entity run", () => {
    const files = tsxFiles(path.join(process.cwd(), "src"));
    expect(files.length).toBeGreaterThan(50);
    const hits = files.flatMap((f) => spaceLosingRuns(readFileSync(f, "utf8")).map((r) => `${path.relative(process.cwd(), f)}: ${r}`));
    expect(hits).toEqual([]);
  });
});
