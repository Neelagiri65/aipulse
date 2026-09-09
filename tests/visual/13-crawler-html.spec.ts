import { expect, test } from "@playwright/test";

/**
 * What a crawler with no JavaScript sees.
 *
 * Every AI answer engine gawk.dev invites by name in `robots.ts` — GPTBot,
 * ClaudeBot, PerplexityBot, CCBot — fetches HTML and never runs a script, and
 * Googlebot indexes the raw HTML long before its render pass catches up. Before
 * the homepage was server-rendered, all of them received "connecting… /
 * awaiting first poll / checking": a site whose entire claim is
 * publicly-sourced citable numbers, publishing no numbers.
 *
 * These run with `javaScriptEnabled: false`, so they assert the SERVER HTML and
 * nothing else. If the page ever returns to a client-only shell, they red.
 *
 * Assertions are case-insensitive on purpose: the chrome is uppercased in CSS,
 * so `innerText` reports it uppercased while the HTML source is not.
 */
test.describe("crawler-visible HTML", () => {
  test.use({ javaScriptEnabled: false });

  const bodyText = async (page: import("@playwright/test").Page) =>
    (await page.locator("body").innerText()).replace(/\s+/g, " ");

  test("the homepage answers its own question without JavaScript", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const text = await bodyText(page);

    expect(text).toContain("Is your AI coding stack working right now?");
    // An answer, not a spinner: the count of tools working at the last check.
    expect(text).toMatch(/\d\/\d (operational|degraded|down)/i);

    // Every tool named, each carrying a state word.
    for (const tool of [
      "Claude Code",
      "GitHub Copilot",
      "OpenAI API",
      "OpenAI Codex",
      "Windsurf",
      "Cursor",
    ]) {
      expect(text).toContain(tool);
    }
    expect(text.toLowerCase()).not.toContain("awaiting first poll");
    expect(text.toLowerCase()).not.toContain("connecting…");
  });

  test("every state word arrives with the source and time behind it", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const text = await bodyText(page);

    // Provenance is what makes a number quotable rather than a claim.
    expect(text).toMatch(/checked \d{2}:\d{2} UTC/i);
    for (const source of [
      "anthropic-status",
      "openai-status",
      "github-status",
      "windsurf-status",
      "cursor-status",
    ]) {
      expect(text).toContain(source);
    }
  });

  test("nothing in the prerendered HTML claims to be newer than it is", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const text = await bodyText(page);

    // A relative age frozen into prerendered HTML keeps making its claim after
    // it is printed: "live · 1s" is read minutes later by anyone without
    // JavaScript. Before hydration the pill states a clock time instead.
    expect(text).toMatch(/polled \d{2}:\d{2} UTC/i);
    expect(text).not.toMatch(/live · \d+s/i);
  });
});
