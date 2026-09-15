import { test, expect } from "@playwright/test";
import { openDashboard } from "./_helpers";

/**
 * `/?stack=a,b` proposes a stack; nothing is written until the visitor
 * clicks. The contract (src/lib/stack-url.ts):
 *  - the URL renders one inline "Shared stack" line, never an overlay;
 *  - "Use it" stores the proposal and removes the param; a reload keeps it;
 *  - "Keep mine" leaves the stored stack alone and removes the param;
 *  - the server HTML never carries the proposal or the share link;
 *  - "Copy link" carries the exact share URL in data-share-url.
 */
test.describe("stack share URL", () => {
  test("Use it: the proposal becomes the stack, the param goes, a reload keeps it, Show all clears", async ({ page, baseURL }) => {
    await page.goto("/?stack=cursor,copilot", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tablist").first()).toBeVisible();
    const line = page.getByTestId("stack-shared").first();
    await expect(line).toBeVisible();
    await expect(line).toContainText("Shared stack: Cursor, GitHub Copilot");
    await expect(page.getByTestId("health-list").first()).toHaveAttribute("data-stack", "0");

    await page.getByTestId("stack-shared-use").first().click();
    await expect(page.getByTestId("health-list").first()).toHaveAttribute("data-stack", "2");
    await expect(page.getByTestId("stack-shared")).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("stack")).toBe(false);
    const share = page.getByTestId("stack-share").first();
    await expect(share).toHaveAttribute("data-share-url", `${baseURL?.replace(/\/$/, "")}/?stack=cursor,copilot`);

    await page.reload();
    await openDashboard(page);
    await expect(page.getByTestId("health-list").first()).toHaveAttribute("data-stack", "2");
    await expect(page.getByTestId("stack-shared")).toHaveCount(0);

    await page.getByTestId("stack-clear").first().click();
    await expect(page.getByTestId("health-list").first()).toHaveAttribute("data-stack", "0");
  });

  test("Keep mine: a stored stack survives a different proposal, and the param goes", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("gawk-stack", JSON.stringify(["cursor"]));
      } catch {}
    });
    const page = await ctx.newPage();
    await page.goto("/?stack=windsurf", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tablist").first()).toBeVisible();
    await expect(page.getByTestId("stack-shared").first()).toContainText("Shared stack: Windsurf");
    await expect(page.getByTestId("stack-shared-keep").first()).toHaveText("Keep mine");
    await page.getByTestId("stack-shared-keep").first().click();
    await expect(page.getByTestId("stack-shared")).toHaveCount(0);
    await expect(page.getByTestId("health-list").first()).toHaveAttribute("data-stack", "1");
    await expect(page.getByTestId("stack-chip-cursor").first()).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.has("stack")).toBe(false);
    await ctx.close();
  });

  test("a proposal equal to the stored stack shows no line", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("gawk-stack", JSON.stringify(["cursor", "copilot"]));
      } catch {}
    });
    const page = await ctx.newPage();
    await page.goto("/?stack=copilot,cursor", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tablist").first()).toBeVisible();
    await expect(page.getByTestId("health-list").first()).toHaveAttribute("data-stack", "2");
    await expect(page.getByTestId("stack-shared")).toHaveCount(0);
    await ctx.close();
  });

  test("server HTML never carries the proposal or the share link", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const html = await (await page.request.get("/?stack=cursor,copilot")).text();
    expect(html).not.toContain("stack-shared");
    expect(html).not.toContain("stack-share");
    expect(html).toContain('data-testid="stack-picker"');
    await ctx.close();
  });
});
