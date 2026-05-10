/**
 * Captures map screenshots from gawk.dev using Playwright.
 * Produces 1920x1080 PNGs saved to public/video-screenshots/.
 *
 * Usage: npx tsx scripts/video/capture-screenshots.ts
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { resolve } from "path";

const BASE_URL = process.env.GAWK_BASE_URL || "https://gawk.dev";
const OUT_DIR = resolve(process.cwd(), "public/video-screenshots");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // Wait for map to load
  console.log("Loading gawk.dev...");
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Screenshot 1: Global map view
  console.log("Capturing global map...");
  await page.screenshot({
    path: resolve(OUT_DIR, "map-global.png"),
    fullPage: false,
  });

  // Screenshot 2: Try to zoom into the most active region by clicking the map
  console.log("Capturing map zoom...");
  // Click center of the map area to trigger a cluster popup
  const mapEl = await page.$(".leaflet-container") ?? await page.$("[class*=globe]") ?? await page.$("canvas");
  if (mapEl) {
    const box = await mapEl.boundingBox();
    if (box) {
      // Click slightly right of center (usually where clusters are)
      await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
      await page.waitForTimeout(1500);
    }
  }
  await page.screenshot({
    path: resolve(OUT_DIR, "map-zoom.png"),
    fullPage: false,
  });

  await browser.close();
  console.log(`Screenshots saved to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("Screenshot capture failed:", e);
  process.exit(1);
});
