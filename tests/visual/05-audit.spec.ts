import { expect, test } from "@playwright/test";
import { shot } from "./_helpers";

/**
 * /audit is the deterministic CLAUDE.md / .cursorrules / etc. scanner
 * route — the only scoring surface in the app and explicitly labelled
 * as pattern-matching, not LLM inference. Smoke-test its shell loads.
 */

test.describe("audit page", () => {
  test("renders the audit form shell", async ({ page }) => {
    await page.goto("/audit", { waitUntil: "domcontentloaded" });
    // The audit page is client-rendered; wait for the repo input.
    await expect(page.locator("body")).toBeVisible();
    // We don't assume specific copy (it may evolve) — capture a screenshot
    // so any regression in the shell is visible in review.
    await page.waitForTimeout(1200);
    await shot(page, "page-audit", { fullPage: true });
  });
});
