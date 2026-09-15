import { test, expect } from "@playwright/test";
import { openDashboard, shot } from "./_helpers";

/**
 * "Your stack" — the Health panel's inline picker. The contract:
 *  - no stack: today's heading, every tool listed, no divider;
 *  - pick a tool: the heading answers for that stack from the same severity
 *    derivation as the global pill, the stack lists first, everything else
 *    follows a divider — nothing hidden;
 *  - the choice survives a reload; "Show all" clears it and that survives too.
 * Explicit choice only, localStorage only, never an overlay.
 */
test.describe("stack picker", () => {
  test("pick → personal heading + reorder, reload → persisted, show all → cleared", async ({ page }) => {
    await openDashboard(page);
    const heading = page.getByTestId("health-heading").first();
    await expect(heading).toContainText(/tool health · incidents first/i);
    const rows = page.locator('[data-testid^="tool-row-"]');
    const total = await rows.count();
    expect(total).toBeGreaterThanOrEqual(6);
    await expect(page.getByTestId("stack-others")).toHaveCount(0);

    await page.getByTestId("stack-chip-copilot").first().click();
    await expect(heading).toContainText(/your stack · \d\/1 /i);
    await expect(rows.first()).toHaveAttribute("data-tool", "copilot");
    await expect(page.getByTestId("stack-others").first()).toContainText(String(total - 1));
    await expect(rows).toHaveCount(total); // nothing hidden
    await shot(page, "stack-picker-copilot");

    await page.reload();
    await openDashboard(page);
    await expect(heading).toContainText(/your stack · \d\/1 /i);
    await expect(page.getByTestId("stack-chip-copilot").first()).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("stack-clear").first().click();
    await expect(heading).toContainText(/tool health · incidents first/i);
    await page.reload();
    await openDashboard(page);
    await expect(heading).toContainText(/tool health · incidents first/i);
    await expect(page.getByTestId("stack-others")).toHaveCount(0);
  });

  test("server HTML never carries a stack: fresh context lists every tool unscoped", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("gawk-stack", JSON.stringify(["cursor"]));
      } catch {}
    });
    const page = await ctx.newPage();
    const res = await page.request.get("/");
    const html = await res.text();
    expect(html).toContain("Tool health · incidents first");
    expect(html).not.toContain("Your stack ·");
    expect(html).not.toContain('data-testid="stack-others"');
    await ctx.close();
  });
});
