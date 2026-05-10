/**
 * Capture mock graphic screenshots for review before full render.
 * Outputs: out/mock-leaderboard.png, out/mock-cta.png
 */
import { chromium } from "@playwright/test";
import { resolve } from "path";
import { mkdirSync } from "fs";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "out");
const HTML_PATH = resolve(ROOT, "scripts/video/mock-graphics.html");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  await page.goto(`file://${HTML_PATH}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Screenshot 1: Leaderboard
  await page.evaluate(() => {
    const nav = document.querySelector('.nav') as HTMLElement;
    if (nav) nav.style.display = 'none';
  });
  await page.screenshot({ path: resolve(OUT_DIR, "mock-leaderboard.png"), fullPage: false });
  console.log("Saved: out/mock-leaderboard.png");

  // Screenshot 2: CTA
  await page.evaluate(() => {
    document.querySelectorAll('.frame').forEach(f => f.classList.remove('active'));
    document.getElementById('frame-cta')!.classList.add('active');
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT_DIR, "mock-cta.png"), fullPage: false });
  console.log("Saved: out/mock-cta.png");

  await browser.close();
  console.log("\nDone. Review both screenshots before rendering.");
}

main().catch((e) => {
  console.error("Mock capture failed:", e);
  process.exit(1);
});
