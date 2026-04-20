import { defineConfig, devices } from "@playwright/test";

/**
 * AI Pulse visual smoke test harness.
 *
 * Default target: the live Vercel deploy. Override with
 *   LOCAL_URL=http://localhost:3000 npm run test:visual
 * to run against a local `next dev` / `next start` instance.
 *
 * Viewport: 1440×900 — the Benchmarks panel is 540 wide and Dashboard
 * lays out Wire+Tools side-by-side beginning at 64px / W-420px, so ≤1280
 * forces a collapsed layout that doesn't represent the "observatory"
 * viewing posture we actually ship for.
 *
 * Screenshots land in `test-results/screenshots/` via explicit
 * `page.screenshot({ path: ... })` calls; the `screenshot: "only-on-failure"`
 * setting below is Playwright's trace screenshot (separate artefact).
 */
const BASE_URL = process.env.LOCAL_URL ?? "https://aipulse-pi.vercel.app";

export default defineConfig({
  testDir: "tests/visual",
  outputDir: "test-results/playwright",
  globalSetup: "./tests/visual/_global-setup.ts",
  // Live-site polls can be slow on first navigation (Vercel cold start,
  // initial data fetches for /api/globe-events + /api/registry + ...).
  // 60s global + 45s per-action gives the UI time to stabilise before
  // Playwright starts screenshotting.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    colorScheme: "dark",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
