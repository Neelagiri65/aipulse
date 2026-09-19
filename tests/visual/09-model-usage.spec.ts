import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import { shot } from "./_helpers";

/**
 * /panels/model-usage is the standalone destination the daily digest
 * deep-links into via `?focus={slug}`. Smoke-test the shell renders
 * even before the cron has populated `openrouter:rankings:latest`
 * (panel falls back to "Collecting baseline" copy until the first
 * 6h cron writes).
 */

test.describe("Model Usage page", () => {
  test("renders the panel shell", async ({ page }) => {
    await page.goto("/panels/model-usage", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Model Usage" })).toBeVisible();
    // Allow one fetch + render cycle. Either populated rows, the
    // pre-cron empty-state copy, or the loading state are all
    // acceptable steady-states for this smoke.
    await page.waitForTimeout(1200);
    await shot(page, "page-model-usage", { fullPage: true });
  });

  /**
   * The transition the empty state promises — "Rankings appear after the
   * first OpenRouter cron fire" — used to take down the whole page.
   *
   * `ModelUsageList` called `React.useMemo` BELOW its empty-state return, so
   * the cold render ran one hook and the render after the data arrived ran
   * two: React error #310, caught by the route's error boundary, leaving
   * "This page couldn't load" where the panel should be. Every reader with
   * the page open across the first cron write of a fresh deploy hit it.
   *
   * No unit test could see this. The panel's tests use
   * `renderToStaticMarkup`, which renders once, and a hook-order violation
   * only bites on the second render. So it lives here, where the component
   * really mounts and really re-renders.
   */
  test("survives the empty -> populated transition", async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(e.message.split("\n")[0]));

    const full = JSON.parse(
      // Path from the repo root: Playwright transpiles these specs to CJS,
      // where `import.meta.url` is not available.
      readFileSync("tests/visual/fixtures/model-usage-transition.json", "utf8"),
    ) as { rows: unknown[] };
    let call = 0;
    await page.route("**/api/panels/model-usage*", (route) => {
      call += 1;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        // First answer: the pre-cron window. Then: the cron has written.
        body: JSON.stringify(call === 1 ? { ...full, rows: [] } : full),
      });
    });

    await page.goto("/panels/model-usage", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".model-usage-empty")).toBeVisible();

    // The panel polls every 60s, and `usePolledEndpoint` also refetches the
    // moment the tab becomes visible. Use that instead of waiting a minute.
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );

    // Settle on whichever outcome arrives — rows, or a thrown error — so the
    // crash is asserted FIRST and names itself. Asserting the row count first
    // reports "expected 30, got 0", which is a symptom of the boundary having
    // swallowed a React error, not the error. Polling on the thrown error
    // rather than the boundary's copy: that copy is Next's, it carries a
    // typographic apostrophe, and a locator for it silently matched nothing.
    await expect
      .poll(
        async () =>
          crashes.length > 0 ||
          (await page.locator(".provider-dot").count()) > 0,
        { timeout: 15_000 },
      )
      .toBe(true);
    expect(crashes, `the page threw: ${crashes.join(" | ")}`).toEqual([]);
    await expect(page.locator(".provider-dot")).toHaveCount(full.rows.length);
    await expect(page.locator(".model-usage-empty")).toHaveCount(0);
  });

  test("?focus= seeds the drawer when the slug exists", async ({ page }) => {
    // Use a deterministic slug expected to appear at or near the top
    // of any populated DTO. When the DTO is empty (pre-cron window)
    // the drawer simply doesn't mount and the shell-renders check
    // still passes.
    await page.goto(
      "/panels/model-usage?focus=anthropic%2Fclaude-sonnet-4.6",
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByRole("heading", { name: "Model Usage" })).toBeVisible();
    await page.waitForTimeout(1200);
    await shot(page, "page-model-usage-focused", { fullPage: true });
  });
});
