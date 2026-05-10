/**
 * Records a screen capture of the gawk.dev map walkthrough.
 * Drives the Leaflet map via __apMap, flies to continents, clicks clusters.
 *
 * Output: out/map-walkthrough.webm (Playwright's native format)
 *
 * Usage: npx tsx scripts/video/record-map.ts
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { resolve } from "path";

const BASE_URL = process.env.GAWK_BASE_URL || "https://gawk.dev";
const OUT_DIR = resolve(process.cwd(), "out");

type ContinentFlight = {
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  holdMs: number;
};

const FLIGHTS: ContinentFlight[] = [
  { name: "Europe",        lat: 50,  lng: 15,   zoom: 4, holdMs: 5000 },
  { name: "North America", lat: 40,  lng: -95,  zoom: 4, holdMs: 5000 },
  { name: "Asia",          lat: 30,  lng: 100,  zoom: 4, holdMs: 5000 },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  console.log("Loading gawk.dev...");
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });

  // Wait for map clusters to appear
  console.log("Waiting for map clusters...");
  try {
    await page.waitForSelector(".ap-fm-cluster", { timeout: 15000 });
  } catch {
    console.warn("No clusters found — map may not have loaded fully. Continuing...");
  }
  await page.waitForTimeout(2000);

  // Get the Leaflet map instance
  const mapReady = await page.evaluate(() => {
    const root = document.querySelector(".ap-fm-root");
    if (!root) return false;
    const map = (root as any).__apMap;
    if (!map || typeof map.flyTo !== "function") return false;
    (window as any).__map = map;
    return true;
  });

  if (!mapReady) {
    console.error("Could not find Leaflet map instance on .ap-fm-root.__apMap");
    await context.close();
    await browser.close();
    process.exit(1);
  }

  console.log("Map instance ready. Starting walkthrough...");

  // Scene: Hold global view (3s)
  console.log("  [0s] Global view...");
  await page.waitForTimeout(3000);

  // Fly to each continent
  for (const flight of FLIGHTS) {
    console.log(`  Flying to ${flight.name}...`);

    // Fly to the continent
    await page.evaluate(({ lat, lng, zoom }) => {
      (window as any).__map.flyTo([lat, lng], zoom, { duration: 2 });
    }, flight);

    // Wait for fly animation + tile load
    await page.waitForTimeout(3000);

    // Click the largest visible cluster
    const clicked = await clickLargestCluster(page);
    if (clicked) {
      console.log(`  ✓ Clicked cluster in ${flight.name}`);
      // Hold on popup for a few seconds
      await page.waitForTimeout(flight.holdMs);
      // Dismiss popup by clicking elsewhere
      await page.mouse.click(100, 100);
      await page.waitForTimeout(500);
    } else {
      console.log(`  ✗ No cluster found in ${flight.name}, holding view...`);
      await page.waitForTimeout(flight.holdMs);
    }
  }

  // Return to global view
  console.log("  Zooming out to global...");
  await page.evaluate(() => {
    (window as any).__map.flyTo([20, 0], 2, { duration: 2.5 });
  });
  await page.waitForTimeout(3500);

  // Close context to finalize video
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  if (videoPath) {
    console.log(`Map walkthrough saved to: ${videoPath}`);
  } else {
    console.log("Video recording complete (check out/ directory).");
  }
}

async function clickLargestCluster(page: import("@playwright/test").Page): Promise<boolean> {
  // Find all visible cluster markers and click the one with the highest count
  const clusterInfo = await page.evaluate(() => {
    const clusters = document.querySelectorAll(".ap-fm-cluster");
    if (clusters.length === 0) return null;

    let best: { x: number; y: number; count: number } | null = null;
    for (const el of clusters) {
      const rect = el.getBoundingClientRect();
      // Skip if off-screen
      if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) continue;

      // Parse count from the text content
      const text = el.textContent?.trim() ?? "";
      const countMatch = text.match(/^(\d+\+?)/);
      let count = 0;
      if (countMatch) {
        count = countMatch[1].endsWith("+") ? 100 : parseInt(countMatch[1], 10);
      }

      if (!best || count > best.count) {
        best = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          count,
        };
      }
    }
    return best;
  });

  if (!clusterInfo) return false;

  await page.mouse.click(clusterInfo.x, clusterInfo.y);
  await page.waitForTimeout(800);
  return true;
}

main().catch((e) => {
  console.error("Map recording failed:", e);
  process.exit(1);
});
