import { expect, test, type Page } from "@playwright/test";

import { BOARD_IDS } from "@/components/chrome/primary-tabs";

/**
 * Every board body, in both themes, at the WCAG AA floor.
 *
 * The ten boards were written when they floated over the dark map, so their bodies were
 * light-on-dark by origin: 300/400-level hues and opacity-diluted muted text on an assumed dark
 * ground. When #111 turned boards into reading surfaces on paper, 43 text elements across the ten
 * landed under 4.5:1 — SDK Adoption's package names at 1.04, i.e. white on white. Screenshots did
 * not catch it (the page looked "designed"), and no test asserted a colour.
 *
 * So this asserts the property, not a palette: for every text leaf, the contrast between its
 * painted colour and the first opaque ground behind it clears 4.5:1 (3:1 for large text). Colours
 * are resolved by painting them on a canvas — computed values arrive as `oklab(...)` / `lab(...)`
 * and parsing those as rgb triplets silently yields nonsense.
 */

const FLOOR = 4.5;
const LARGE_FLOOR = 3;

type Finding = { text: string; cls: string; ratio: number; need: number };

async function contrastFailures(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="board-view"]');
    if (!root) return [];
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    const cache = new Map<string, { r: number; g: number; b: number; a: number }>();
    const rgba = (c: string) => {
      const hit = cache.get(c);
      if (hit) return hit;
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      const v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
      cache.set(c, v);
      return v;
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ground = (el: Element) => {
      let n: Element | null = el;
      while (n) {
        const c = rgba(getComputedStyle(n).backgroundColor);
        if (c.a > 0.5) return c;
        n = n.parentElement;
      }
      return rgba(getComputedStyle(document.body).backgroundColor);
    };

    const out: Finding[] = [];
    const seen = new Set<string>();
    for (const el of Array.from(root.querySelectorAll("*"))) {
      const t = (el.textContent ?? "").trim();
      if (!t || el.children.length > 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      const fg = rgba(cs.color);
      const bg = ground(el);
      const bgL = lum(bg);
      const mixed =
        fg.a < 1
          ? {
              r: fg.r * fg.a + bg.r * (1 - fg.a),
              g: fg.g * fg.a + bg.g * (1 - fg.a),
              b: fg.b * fg.a + bg.b * (1 - fg.a),
            }
          : fg;
      const fgL = lum(mixed);
      const ratio = (Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05);
      const size = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 600;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < need) {
        const key = `${String(el.className)}|${cs.color}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ text: t.slice(0, 40), cls: String(el.className).slice(0, 60), ratio: Math.round(ratio * 100) / 100, need });
      }
    }
    return out;
  }) as Promise<Finding[]>;
}

for (const theme of ["light", "dark"] as const) {
  test(`every board body clears the contrast floor — ${theme}`, async ({ page }) => {
    // A board is a link, so each one is a navigation; the theme is the attribute the stylesheet
    // reads, set before the first board so it survives every goto (localStorage + boot script).
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      document.documentElement.setAttribute("data-theme", t);
      try {
        localStorage.setItem("gawk-theme", t);
      } catch {
        /* private mode: the attribute still applies for this page */
      }
    }, theme);

    const failures: (Finding & { board: string })[] = [];
    for (const id of BOARD_IDS) {
      await page.goto(`/?tab=more&board=${id}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 20_000 });
      // Boards fill from their own poll; assert on the loaded body, not the pending state.
      await page.waitForTimeout(3_500);
      for (const f of await contrastFailures(page)) failures.push({ board: id, ...f });
    }

    expect(
      failures,
      `text under the ${FLOOR}:1 floor (${LARGE_FLOOR}:1 for large):\n` +
        failures.map((f) => `  ${f.board}: ${f.ratio} < ${f.need} "${f.text}" [${f.cls}]`).join("\n"),
    ).toEqual([]);
  });
}
