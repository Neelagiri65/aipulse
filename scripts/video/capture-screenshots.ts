/**
 * Captures map screenshots from gawk.dev using Playwright.
 * Takes global view + per-continent zoomed views by programmatically
 * calling Leaflet's flyTo() on the 2D flat map.
 *
 * Produces 1920x1080 PNGs saved to public/video-screenshots/.
 *
 * Usage: npx tsx scripts/video/capture-screenshots.ts
 */

import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";
import { resolve } from "path";

const BASE_URL = process.env.GAWK_BASE_URL || "https://gawk.dev";
const OUT_DIR = resolve(process.cwd(), "public/video-screenshots");

type ContinentView = {
  name: string;
  file: string;
  lat: number;
  lng: number;
  zoom: number;
};

const CONTINENT_VIEWS: ContinentView[] = [
  { name: "North America", file: "continent-north-america.png", lat: 40,  lng: -95,  zoom: 4 },
  { name: "Europe",        file: "continent-europe.png",        lat: 50,  lng: 15,   zoom: 4 },
  { name: "Asia",          file: "continent-asia.png",          lat: 30,  lng: 100,  zoom: 4 },
  { name: "South America", file: "continent-south-america.png", lat: -15, lng: -55,  zoom: 4 },
  { name: "Africa",        file: "continent-africa.png",        lat: 5,   lng: 20,   zoom: 4 },
  { name: "Oceania",       file: "continent-oceania.png",       lat: -28, lng: 140,  zoom: 4 },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  console.log("Loading gawk.dev...");
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(4000);

  // Screenshot 1: Global map view
  console.log("Capturing global map...");
  await page.screenshot({
    path: resolve(OUT_DIR, "map-global.png"),
    fullPage: false,
  });

  // Find the Leaflet map instance
  const hasLeaflet = await page.evaluate(() => {
    const mapContainer = document.querySelector(".leaflet-container");
    if (!mapContainer) return false;
    // Leaflet stores the map instance on the DOM element as _leaflet_map
    const mapKeys = Object.keys(mapContainer).filter(k => k.startsWith("_leaflet"));
    if (mapKeys.length === 0) return false;
    // Access via the internal Leaflet ID
    const leafletId = (mapContainer as any)._leaflet_id;
    if (!leafletId) return false;
    // The map instance is stored globally by Leaflet
    for (const key of Object.keys(window)) {
      const val = (window as any)[key];
      if (val && val._container === mapContainer && typeof val.flyTo === "function") {
        (window as any).__gawkMap = val;
        return true;
      }
    }
    // Fallback: traverse Leaflet's internal map registry
    if (typeof (window as any).L !== "undefined") {
      // L doesn't expose a map registry, but the map is on the container
      return false;
    }
    return false;
  });

  // Alternative: access Leaflet map via the container's internal property
  const hasMap = hasLeaflet || await page.evaluate(() => {
    const container = document.querySelector(".leaflet-container");
    if (!container) return false;
    // Leaflet 1.x stores map on _leaflet_id and we can access via a detour
    const keys = Object.keys(container);
    for (const key of keys) {
      if (key.startsWith("_leaflet")) {
        const val = (container as any)[key];
        if (typeof val === "object" && val !== null && typeof val.flyTo === "function") {
          (window as any).__gawkMap = val;
          return true;
        }
      }
    }
    // React fiber approach
    const fiberKey = Object.keys(container).find(k => k.startsWith("__reactFiber$"));
    if (fiberKey) {
      let fiber = (container as any)[fiberKey];
      let attempts = 0;
      while (fiber && attempts < 60) {
        const ref = fiber.memoizedProps?.mapRef ?? fiber.ref;
        if (ref?.current && typeof ref.current.flyTo === "function") {
          (window as any).__gawkMap = ref.current;
          return true;
        }
        // Check stateNode
        if (fiber.stateNode && typeof fiber.stateNode.flyTo === "function") {
          (window as any).__gawkMap = fiber.stateNode;
          return true;
        }
        fiber = fiber.return;
        attempts++;
      }
    }
    return false;
  });

  if (hasMap) {
    console.log("Leaflet map instance found — capturing continent screenshots...");

    for (const view of CONTINENT_VIEWS) {
      console.log(`  Flying to ${view.name}...`);
      await page.evaluate(({ lat, lng, zoom }) => {
        const map = (window as any).__gawkMap;
        if (map?.setView) {
          map.setView([lat, lng], zoom, { animate: false });
          map.invalidateSize();
        }
      }, view);

      // Wait for tiles to load
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: resolve(OUT_DIR, view.file),
        fullPage: false,
      });
      console.log(`  ✓ ${view.file}`);
    }

    // Return to global view
    console.log("  Returning to global view...");
    await page.evaluate(() => {
      const map = (window as any).__gawkMap;
      if (map?.setView) {
        map.setView([20, 0], 2, { animate: false });
        map.invalidateSize();
      }
    });
    await page.waitForTimeout(1500);
  } else {
    console.warn("Could not find Leaflet map instance — continent screenshots skipped.");
    console.warn("Tip: the map may not have loaded. Check if gawk.dev is accessible.");
  }

  // Final screenshot
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
