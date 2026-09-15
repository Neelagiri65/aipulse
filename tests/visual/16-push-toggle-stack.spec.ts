import { test, expect } from "@playwright/test";
import { openDashboard } from "./_helpers";

/**
 * The push toggle × stack. Headless Chromium cannot grant a push
 * subscription (Notification.permission reports "denied"), so this pins
 * what IS observable in any permission state: the toggle reads the stored
 * stack after hydration (data-scope = stack size; in the idle state the
 * title names it) and the server HTML never carries it.
 * Targeting itself is proven by unit tests (src/lib/push/__tests__) and,
 * on prod, by the `push-send: … skipped=N` line the tool-alerts route
 * logs on the first real transition after merge.
 */
test.describe("push toggle × stack", () => {
  test("a stored stack reaches the toggle after hydration, whatever the permission state", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("gawk-stack", JSON.stringify(["cursor", "copilot"]));
      } catch {}
    });
    const page = await ctx.newPage();
    await openDashboard(page);
    const toggle = page.getByTestId("push-toggle").first();
    await expect(toggle).toBeAttached();
    await expect(toggle).toHaveAttribute("data-scope", "2");
    const state = await toggle.getAttribute("data-state");
    expect(["idle", "subscribed", "denied", "unsupported"]).toContain(state);
    if (state === "idle") await expect(toggle).toHaveAttribute("title", /your stack \(2 tools\)/);
    if (state === "subscribed") await expect(toggle).toContainText("your stack (2)");
    await ctx.close();
  });

  test("no stack: scope is 0 and, when the offer renders, it is for every tool", async ({ page }) => {
    await openDashboard(page);
    const toggle = page.getByTestId("push-toggle").first();
    await expect(toggle).toBeAttached();
    await expect(toggle).toHaveAttribute("data-scope", "0");
    if ((await toggle.getAttribute("data-state")) === "idle") {
      await expect(toggle).toHaveAttribute("title", /AI tool outages/);
    }
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
    expect(html).toMatch(/data-testid="push-toggle"[^>]*data-state="idle"[^>]*data-scope="0"/);
    expect(html).not.toContain('data-scope="1"');
    expect(html).not.toContain("your stack (");
    await ctx.close();
  });
});
