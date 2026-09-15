import { test, expect } from "@playwright/test";
import { openDashboard } from "./_helpers";

/**
 * The push toggle × stack. Headless Chromium cannot grant a push
 * subscription, so this pins what IS observable without one: the toggle
 * reads the stored stack after hydration (data-scope = stack size, the
 * title names the stack) and the server HTML never carries it.
 * Targeting itself is proven by unit tests (src/lib/push/__tests__) and,
 * on prod, by the `push-send: … skipped=N` line the tool-alerts route
 * logs on the first real transition after merge.
 */
test.describe("push toggle × stack", () => {
  test("a stored stack scopes the offer: data-scope and title reflect it after hydration", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("gawk-stack", JSON.stringify(["cursor", "copilot"]));
      } catch {}
    });
    const page = await ctx.newPage();
    await openDashboard(page);
    const toggle = page.getByTestId("push-toggle").first();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("data-scope", "2");
    await expect(toggle).toHaveAttribute("title", /your stack \(2 tools\)/);
    await ctx.close();
  });

  test("no stack: the offer is for every tool", async ({ page }) => {
    await openDashboard(page);
    const toggle = page.getByTestId("push-toggle").first();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("data-scope", "0");
    await expect(toggle).toHaveAttribute("title", /AI tool outages/);
  });

  test("server HTML never carries a stack on the toggle", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("gawk-stack", JSON.stringify(["cursor"]));
      } catch {}
    });
    const page = await ctx.newPage();
    const html = await (await page.request.get("/")).text();
    expect(html).toContain('data-scope="0"');
    expect(html).not.toContain('data-scope="1"');
    expect(html).not.toContain("your stack (");
    await ctx.close();
  });
});
