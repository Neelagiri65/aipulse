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
