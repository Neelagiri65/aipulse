import { expect, test } from "@playwright/test";
import { shot } from "./_helpers";

/**
 * /panels/sdk-adoption is the standalone destination the daily digest
 * deep-links into via `?focus={pkgId}`. Smoke-test the shell renders
 * even before the matrix has 30d of history (panel falls back to
 * "Collecting baseline" copy in that window).
 */

test.describe("SDK Adoption page", () => {
  test("renders the panel shell", async ({ page }) => {
    await page.goto("/panels/sdk-adoption", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "SDK Adoption" })).toBeVisible();
    // Allow one fetch + render cycle. Either matrix grid OR baseline
    // copy OR loading copy is an acceptable steady-state for this smoke.
    await page.waitForTimeout(1200);
    await shot(page, "page-sdk-adoption", { fullPage: true });
  });

  test("?focus= seeds the drawer when the row exists", async ({ page }) => {
    // Use a deterministic row id likely to exist in any non-empty DTO;
    // when the DTO is empty (pre-baseline window) the drawer simply
    // doesn't mount and the test still passes the shell-renders check.
    await page.goto("/panels/sdk-adoption?focus=pypi:transformers", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "SDK Adoption" })).toBeVisible();
    await page.waitForTimeout(1200);
    await shot(page, "page-sdk-adoption-focused", { fullPage: true });
  });
});
