/**
 * Video-first walkthrough recorder.
 *
 * Pipeline: curate → record video (fixed timings) → generate script to fit.
 *
 * Reads curated.json for narratives, assigns fixed durations per segment type,
 * records the walkthrough, and outputs a timing manifest that the narration
 * generator uses to write script + TTS to match.
 *
 * Output:
 *   out/walkthrough.webm          — the recorded video
 *   data/video-manifest.json      — per-segment timestamps for narration sync
 *
 * Usage: npx tsx scripts/video/record-walkthrough.ts
 *        npx tsx scripts/video/record-walkthrough.ts --format linkedin
 */

import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import { resolve } from "path";
import type { CurationResult, Narrative } from "../../src/lib/curation/types";

const BASE_URL = process.env.GAWK_BASE_URL || "https://gawk.dev";
const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "out");
const CURATED = resolve(ROOT, "data/curated.json");

const args = process.argv.slice(2);
const FORMAT = args.includes("--format")
  ? (args[args.indexOf("--format") + 1] ?? "youtube")
  : "youtube";

type SceneDirection = "globe" | "tools" | "models" | "wire" | "sdk-adoption" | "labs";

type SegmentPlan = {
  id: string;
  segment: string;
  headline: string;
  scene: SceneDirection;
  holdSec: number;
};

type ManifestEntry = SegmentPlan & {
  startSec: number;
  endSec: number;
};

const SEGMENT_DURATIONS: Record<string, number> = {
  intro: 10,
  hook: 20,
  lead: 15,
  story: 15,
  community: 15,
  radar: 12,
  map: 12,
  outro: 20,
};

const FORMAT_CONFIGS: Record<string, { maxItems: number; introDur: number; outroDur: number }> = {
  youtube: { maxItems: 20, introDur: 10, outroDur: 20 },
  linkedin: { maxItems: 5, introDur: 5, outroDur: 8 },
  instagram: { maxItems: 4, introDur: 5, outroDur: 8 },
};

function sourceToPanel(source: string): SceneDirection {
  if (source.startsWith("gawk-models")) return "models";
  if (source.startsWith("gawk-tools")) return "tools";
  if (source.startsWith("gawk-sdk")) return "sdk-adoption";
  if (source.startsWith("gawk-labs")) return "labs";
  return "wire";
}

function segmentLabel(seg: string): string {
  const map: Record<string, string> = {
    hook: "BREAKING", lead: "TOP STORY", story: "IN FOCUS",
    community: "COMMUNITY", radar: "ON THE RADAR", map: "GLOBAL VIEW",
    intro: "GAWK DAILY", outro: "GAWK DAILY",
  };
  return map[seg] ?? seg.toUpperCase();
}

function sourceLabel(scene: string): string {
  const map: Record<string, string> = {
    "sdk-adoption": "Source: Gawk SDK Tracker",
    models: "Source: Gawk Models Leaderboard",
    tools: "Source: Gawk Tool Health",
    wire: "Source: Gawk Wire",
    labs: "Source: Gawk Labs",
    globe: "Source: gawk.dev",
  };
  return map[scene] ?? "Source: gawk.dev";
}

const OVERLAY_CSS = `
  .gawk-lower-third {
    position: fixed;
    bottom: 140px;
    left: 40px;
    right: 40px;
    z-index: 2147483647;
    background: linear-gradient(135deg, rgba(6, 8, 10, 0.95), rgba(15, 20, 30, 0.92));
    border: 1px solid rgba(45, 212, 191, 0.3);
    border-radius: 12px;
    padding: 20px 28px;
    font-family: 'DM Sans', -apple-system, sans-serif;
    backdrop-filter: blur(16px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(45,212,191,0.08);
    animation: gawk-slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
    max-width: 800px;
  }
  .gawk-lower-third__segment {
    font-size: 11px; font-weight: 600;
    color: rgba(45, 212, 191, 0.8);
    letter-spacing: 3px; text-transform: uppercase; margin-bottom: 6px;
  }
  .gawk-lower-third__headline {
    font-size: 20px; font-weight: 500; color: #e2e8f0; line-height: 1.4;
  }
  .gawk-lower-third__source {
    font-size: 12px; color: #64748b; margin-top: 8px;
    font-family: 'JetBrains Mono', monospace;
  }
  .gawk-badge {
    position: fixed; top: 20px; right: 24px; z-index: 2147483646;
    background: rgba(6, 8, 10, 0.85);
    border: 1px solid rgba(45, 212, 191, 0.25); border-radius: 8px;
    padding: 8px 16px; font-family: 'JetBrains Mono', monospace;
    font-size: 13px; color: rgba(45, 212, 191, 0.9);
    backdrop-filter: blur(8px); pointer-events: none; letter-spacing: 1px;
  }
  .gawk-date {
    position: fixed; top: 20px; left: 24px; z-index: 2147483646;
    font-family: 'JetBrains Mono', monospace; font-size: 12px;
    color: #64748b; pointer-events: none;
  }
  .gawk-intro-overlay {
    position: fixed; inset: 0; z-index: 2147483647; background: #06080a;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', 'DM Sans', -apple-system, sans-serif;
    animation: gawk-intro-in 1s ease-out;
  }
  .gawk-intro-overlay__logo {
    font-size: 72px; font-weight: 700; color: #e2e8f0;
    letter-spacing: 6px; margin-bottom: 16px;
  }
  .gawk-intro-overlay__dot { color: rgba(45, 212, 191, 1); }
  .gawk-intro-overlay__tagline {
    font-size: 18px; color: #64748b; letter-spacing: 2px; margin-bottom: 32px;
    font-family: 'DM Sans', -apple-system, sans-serif;
  }
  .gawk-intro-overlay__date {
    font-size: 14px; color: rgba(45, 212, 191, 0.6);
    letter-spacing: 4px; text-transform: uppercase;
  }
  .gawk-intro-overlay__pulse {
    width: 8px; height: 8px; border-radius: 50%;
    background: rgba(45, 212, 191, 0.8); margin-top: 40px;
    animation: gawk-pulse 1.5s ease-in-out infinite;
  }
  @keyframes gawk-slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes gawk-fade-out {
    from { opacity: 1; }
    to { opacity: 0; transform: translateY(-10px); }
  }
  @keyframes gawk-intro-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes gawk-pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.8); }
  }
  @keyframes gawk-intro-out { from { opacity: 1; } to { opacity: 0; } }
`;

async function hidePageChrome(page: import("@playwright/test").Page) {
  try {
    const rejectBtn = await page.$("button:has-text('Reject all')");
    if (rejectBtn) { await rejectBtn.click(); await page.waitForTimeout(500); }
  } catch { /* no consent banner */ }

  await page.evaluate(() => {
    document.querySelectorAll("[class*='consent'], [class*='Consent'], [class*='cookie'], [class*='Cookie'], [class*='toast'], [class*='Toast'], [class*='Toaster'], [class*='banner'], [class*='Banner']")
      .forEach(el => (el as HTMLElement).style.setProperty("display", "none", "important"));
    document.querySelectorAll("footer, [class*='privacy'], [class*='Privacy']")
      .forEach(el => (el as HTMLElement).style.setProperty("display", "none", "important"));
  });
}

async function showBadge(page: import("@playwright/test").Page) {
  const date = new Date().toISOString().slice(0, 10);
  await page.evaluate((d) => {
    if (document.querySelector(".gawk-badge")) return;
    const badge = document.createElement("div");
    badge.className = "gawk-badge";
    badge.textContent = "LIVE · gawk.dev";
    document.body.appendChild(badge);
    const dateEl = document.createElement("div");
    dateEl.className = "gawk-date";
    dateEl.textContent = d;
    document.body.appendChild(dateEl);
  }, date);
}

async function showLowerThird(
  page: import("@playwright/test").Page,
  segment: string, headline: string, source: string,
) {
  await page.evaluate(({ segment, headline, source }) => {
    document.querySelectorAll(".gawk-lower-third").forEach(el => el.remove());
    const el = document.createElement("div");
    el.className = "gawk-lower-third";
    el.innerHTML = `
      <div class="gawk-lower-third__segment">${segment}</div>
      <div class="gawk-lower-third__headline">${headline}</div>
      <div class="gawk-lower-third__source">${source}</div>
    `;
    document.body.appendChild(el);
  }, { segment, headline, source });
}

async function hideLowerThird(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const el = document.querySelector(".gawk-lower-third") as HTMLElement | null;
    if (el) {
      el.style.animation = "gawk-fade-out 0.4s ease-in forwards";
      setTimeout(() => el.remove(), 400);
    }
  });
}

async function navigateToPanel(page: import("@playwright/test").Page, panelId: string): Promise<boolean> {
  if (panelId === "globe") {
    return page.evaluate(() => {
      const items = document.querySelectorAll(".ap-icon-nav__item");
      for (const item of items) {
        const label = item.querySelector(".ap-icon-nav__label");
        if (label?.textContent?.trim().toLowerCase() === "map") {
          (item as HTMLElement).click();
          return true;
        }
      }
      const map = document.querySelector(".ap-fm-root");
      if (map) { (map as HTMLElement).click(); return true; }
      return false;
    });
  }

  return page.evaluate((target) => {
    const items = document.querySelectorAll(".ap-icon-nav__item");
    for (const item of items) {
      const label = item.querySelector(".ap-icon-nav__label");
      const text = label?.textContent?.trim().toLowerCase() ?? "";
      const norm = target.replace(/-/g, " ");
      if (text === norm || text === target) {
        (item as HTMLElement).click();
        return true;
      }
    }
    for (const item of items) {
      if (item.getAttribute("title")?.toLowerCase().includes(target.replace(/-/g, " "))) {
        (item as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, panelId);
}

function buildSegmentPlan(narratives: Narrative[], config: typeof FORMAT_CONFIGS.youtube): SegmentPlan[] {
  const plan: SegmentPlan[] = [];

  plan.push({
    id: "intro", segment: "intro", headline: "Intro",
    scene: "globe", holdSec: config.introDur,
  });

  for (const n of narratives) {
    const scene = sourceToPanel(n.events[0]?.source ?? "");
    plan.push({
      id: n.id, segment: n.segment, headline: n.headline,
      scene, holdSec: SEGMENT_DURATIONS[n.segment] ?? 15,
    });
  }

  plan.push({
    id: "outro", segment: "outro", headline: "Outro",
    scene: "globe", holdSec: config.outroDur,
  });

  return plan;
}

async function main() {
  if (!existsSync(CURATED)) {
    console.error(`Missing: ${CURATED}\nRun: npm run video:curate --max 20`);
    process.exit(1);
  }

  const config = FORMAT_CONFIGS[FORMAT] ?? FORMAT_CONFIGS.youtube;
  const curated: CurationResult = JSON.parse(readFileSync(CURATED, "utf-8"));
  const narratives = curated.narratives.slice(0, config.maxItems);
  const plan = buildSegmentPlan(narratives, config);

  const totalHold = plan.reduce((s, p) => s + p.holdSec, 0);
  console.log(`Format: ${FORMAT} | ${plan.length} segments | ~${totalHold}s hold time\n`);

  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--run-all-compositor-stages-before-draw", "--disable-checker-imaging"],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUT_DIR, size: { width: 1920, height: 1080 } },
  });

  const page = await context.newPage();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Load gawk.dev first (no recording yet — video starts after page is ready)
  console.log("Pre-loading gawk.dev...");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve());
    });
  });

  // Wait for map to be ready (happens behind the scenes, before recording starts)
  try {
    await page.waitForSelector(".ap-fm-cluster", { timeout: 10000 });
  } catch {
    console.warn("No map clusters found — continuing...");
  }

  const mapReady = await page.evaluate(() => {
    const root = document.querySelector(".ap-fm-root");
    if (!root) return false;
    const map = (root as any).__apMap;
    if (!map || typeof map.flyTo !== "function") return false;
    (window as any).__map = map;
    return true;
  });

  if (mapReady) {
    await page.evaluate(() => {
      (window as any).__map.setView([20, 0], 2, { animate: false });
    });
  }

  await navigateToPanel(page, "globe");
  await hidePageChrome(page);

  // Inject styles + branded intro overlay OVER the loaded page
  await page.addStyleTag({ content: OVERLAY_CSS });
  console.log("Showing branded intro (page already loaded)...");
  await page.evaluate((date) => {
    const overlay = document.createElement("div");
    overlay.className = "gawk-intro-overlay";
    overlay.id = "gawk-intro";
    overlay.innerHTML = `
      <div class="gawk-intro-overlay__logo">gawk<span class="gawk-intro-overlay__dot">.</span>dev</div>
      <div class="gawk-intro-overlay__tagline">See what the AI world actually sees.</div>
      <div class="gawk-intro-overlay__date">${date}</div>
      <div class="gawk-intro-overlay__pulse"></div>
    `;
    document.body.appendChild(overlay);
  }, todayStr);

  // Brief hold on intro card — page is already loaded underneath
  await page.waitForTimeout(3000);

  // Fade out intro — globe is immediately visible
  console.log("Fading out intro...");
  await page.evaluate(() => {
    const intro = document.getElementById("gawk-intro");
    if (intro) {
      intro.style.animation = "gawk-intro-out 0.8s ease-in forwards";
      setTimeout(() => intro.remove(), 800);
    }
  });
  await page.waitForTimeout(1000);

  await hidePageChrome(page);
  await showBadge(page);

  // --- Record segments with actual timestamps ---
  console.log("Recording segments...\n");

  const manifest: ManifestEntry[] = [];
  let clock = 0;
  const introOverheadSec = 4; // 3s hold + 1s fade (page pre-loaded before recording)
  clock = introOverheadSec;

  let lastScene = "";

  for (let i = 0; i < plan.length; i++) {
    const seg = plan[i];
    const holdMs = seg.holdSec * 1000;

    console.log(
      `  [${seg.segment.toUpperCase().padEnd(9)}] ${seg.headline.slice(0, 55).padEnd(55)} ` +
      `${seg.holdSec}s → ${seg.scene}`
    );

    // Navigate if scene changed
    if (seg.scene !== lastScene) {
      if (seg.scene === "globe" && mapReady) {
        await navigateToPanel(page, "globe");
        await page.waitForTimeout(300);
        if (i > 0) {
          const regions = [
            { lat: 50, lng: 15 },
            { lat: 40, lng: -95 },
            { lat: 30, lng: 105 },
          ];
          const region = regions[i % regions.length];
          await page.evaluate(({ lat, lng }) => {
            if ((window as any).__map) {
              (window as any).__map.flyTo([lat, lng], 3, { duration: 2 });
            }
          }, region);
        }
      } else {
        await navigateToPanel(page, seg.scene);
      }
      await page.waitForTimeout(500);
      clock += 0.8;
      lastScene = seg.scene;
    }

    const startSec = Math.round(clock * 10) / 10;

    // Show lower-third (not for intro/outro)
    if (seg.segment !== "intro" && seg.segment !== "outro") {
      await showLowerThird(
        page,
        segmentLabel(seg.segment),
        seg.headline.slice(0, 80),
        sourceLabel(seg.scene),
      );
    }

    // Hold
    await page.waitForTimeout(holdMs);
    clock += seg.holdSec;

    // Scroll for visual movement on longer segments
    if (seg.holdSec > 15 && seg.scene !== "globe") {
      try {
        await page.evaluate(() => {
          const scrollable = document.querySelector("[class*='panel-body']")
            ?? document.querySelector("[class*='drawer']")
            ?? document.querySelector(".ap-panel-scroll");
          if (scrollable) {
            scrollable.scrollTo({ top: scrollable.scrollHeight * 0.3, behavior: "smooth" });
          }
        });
      } catch { /* ignore */ }
    }

    // Hide lower-third
    if (seg.segment !== "intro" && seg.segment !== "outro") {
      await hideLowerThird(page);
      await page.waitForTimeout(400);
      clock += 0.4;
    }

    const endSec = Math.round(clock * 10) / 10;
    manifest.push({ ...seg, startSec, endSec });

    // Brief pause between segments
    await page.waitForTimeout(500);
    clock += 0.5;
  }

  // Final globe hold
  if (mapReady) {
    await page.evaluate(() => {
      (window as any).__map.flyTo([20, 0], 2, { duration: 2 });
    });
  }
  await page.waitForTimeout(3000);

  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  if (videoPath) {
    const destPath = resolve(OUT_DIR, "walkthrough.webm");
    try {
      renameSync(videoPath, destPath);
    } catch {
      const { copyFileSync } = await import("fs");
      copyFileSync(videoPath, destPath);
    }
    console.log(`\nWalkthrough saved: ${destPath}`);
  }

  // Write timing manifest
  const manifestPath = resolve(ROOT, `data/video-manifest-${FORMAT}.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Manifest saved: ${manifestPath}`);
  console.log(`\nTotal segments: ${manifest.length}`);
  console.log(`Estimated duration: ${Math.round(clock)}s`);
  console.log(`\nNext: npx tsx scripts/video/generate-narration.ts --format ${FORMAT}`);
}

main().catch((e) => {
  console.error("Recording failed:", e);
  process.exit(1);
});
