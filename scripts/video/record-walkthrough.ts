/**
 * Cinematic walkthrough recorder for Gawk Daily.
 *
 * NOT a screen recording. This is a scripted video production that uses
 * the live dashboard as a canvas. Every frame is intentional.
 *
 * Rules:
 * - No white screens. Ever. Dark mode only.
 * - No UI chrome visible (popups, tickers, sidebars, badges, legends).
 * - One panel at a time, maximized. Map fades when panel is showing.
 * - Map zooms are full-screen with all panels closed.
 * - Key numbers get full-screen treatment (injected data cards).
 * - Narrative arc: Hook → Deep Dive → Movers → Map → CTA
 *
 * Output:
 *   out/walkthrough.webm          — the recorded video
 *   data/video-manifest.json      — per-segment timestamps for narration sync
 */

import { chromium, type Page } from "@playwright/test";
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

const FORMAT_CONFIGS: Record<string, { maxItems: number; width: number; height: number }> = {
  youtube: { maxItems: 12, width: 1920, height: 1080 },
  linkedin: { maxItems: 5, width: 1920, height: 1080 },
  instagram: { maxItems: 10, width: 1080, height: 1920 },
};

const IS_VERTICAL = (FORMAT_CONFIGS[FORMAT]?.height ?? 1080) > (FORMAT_CONFIGS[FORMAT]?.width ?? 1920);

function sourceToPanel(source: string): SceneDirection {
  if (source.startsWith("gawk-models")) return "models";
  if (source.startsWith("gawk-tools")) return "tools";
  if (source.startsWith("gawk-sdk")) return "sdk-adoption";
  if (source.startsWith("gawk-labs")) return "labs";
  return "wire";
}

// --- CSS for injected overlays ---

function buildOverlayCSS(vertical: boolean): string {
  const numSize = vertical ? "80px" : "120px";
  const arrowSize = vertical ? "56px" : "80px";
  const titleSize = vertical ? "26px" : "32px";
  const titleMax = vertical ? "90%" : "800px";
  const ltBottom = vertical ? "120px" : "60px";
  const ltLeft = vertical ? "24px" : "40px";
  const ltMaxW = vertical ? "calc(100% - 48px)" : "700px";
  const ltHeadSize = vertical ? "22px" : "18px";
  const ctaLogo = vertical ? "48px" : "64px";
  const ctaTag = vertical ? "18px" : "20px";
  const ctaDir = vertical ? "column" : "row";
  const lbHero = vertical ? "48px" : "72px";
  const lbHeroSub = vertical ? "22px" : "28px";
  const lbTableW = vertical ? "90%" : "700px";
  const lbRowFont = vertical ? "17px" : "20px";
  const lbRankFont = vertical ? "15px" : "18px";
  const lbValFont = vertical ? "15px" : "18px";

  return `
  .gawk-data-card {
    position: fixed; inset: 0; z-index: 2147483647;
    background: #06080a;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', 'DM Sans', -apple-system, sans-serif;
    pointer-events: none; padding: ${vertical ? "40px 24px" : "0"};
    animation: gawk-card-in 0.5s ease-out;
  }
  .gawk-data-card__label {
    font-size: 14px; font-weight: 600; color: rgba(45, 212, 191, 0.7);
    letter-spacing: 4px; text-transform: uppercase; margin-bottom: 20px;
  }
  .gawk-data-card__number {
    font-size: ${numSize}; font-weight: 700; line-height: 1;
    margin-bottom: 16px;
  }
  .gawk-data-card__number--up { color: #4ade80; }
  .gawk-data-card__number--down { color: #f87171; }
  .gawk-data-card__number--neutral { color: #e2e8f0; }
  .gawk-data-card__title {
    font-size: ${titleSize}; font-weight: 500; color: #e2e8f0;
    margin-bottom: 12px; text-align: center; max-width: ${titleMax};
    font-family: 'DM Sans', -apple-system, sans-serif;
  }
  .gawk-data-card__source {
    font-size: 14px; color: #64748b;
    font-family: 'JetBrains Mono', monospace;
  }
  .gawk-data-card__arrow {
    font-size: ${arrowSize}; line-height: 1; margin-bottom: 8px;
  }
  .gawk-data-card__arrow--up { color: #4ade80; }
  .gawk-data-card__arrow--down { color: #f87171; }

  .gawk-headline-card {
    position: fixed; inset: 0; z-index: 2147483647;
    background: #06080a;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'DM Sans', -apple-system, sans-serif;
    pointer-events: none; padding: ${vertical ? "40px 32px" : "0 120px"};
    animation: gawk-card-in 0.5s ease-out;
  }
  .gawk-headline-card__label {
    font-size: 14px; font-weight: 600; color: rgba(45, 212, 191, 0.7);
    letter-spacing: 4px; text-transform: uppercase; margin-bottom: 24px;
    font-family: 'JetBrains Mono', monospace;
  }
  .gawk-headline-card__text {
    font-size: ${vertical ? "28px" : "36px"}; font-weight: 500; color: #e2e8f0;
    line-height: 1.4; text-align: center; max-width: ${vertical ? "90%" : "900px"};
  }
  .gawk-headline-card__source {
    font-size: 14px; color: #64748b; margin-top: 24px;
    font-family: 'JetBrains Mono', monospace;
  }

  .gawk-lower-third {
    position: fixed;
    bottom: ${ltBottom}; left: ${ltLeft};
    z-index: 2147483647;
    background: linear-gradient(135deg, #06080a, #0f141e);
    border: 1px solid rgba(45, 212, 191, 0.3);
    border-radius: 12px;
    padding: 16px 24px;
    font-family: 'DM Sans', -apple-system, sans-serif;
    backdrop-filter: blur(16px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(45,212,191,0.08);
    animation: gawk-slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
    max-width: ${ltMaxW};
  }
  .gawk-lower-third__segment {
    font-size: 11px; font-weight: 600;
    color: rgba(45, 212, 191, 0.8);
    letter-spacing: 3px; text-transform: uppercase; margin-bottom: 4px;
  }
  .gawk-lower-third__headline {
    font-size: ${ltHeadSize}; font-weight: 500; color: #e2e8f0; line-height: 1.3;
  }

  .gawk-watermark {
    position: fixed; top: 20px; right: 24px; z-index: 2147483646;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px; color: rgba(45, 212, 191, 0.5);
    pointer-events: none; letter-spacing: 1px;
    animation: gawk-fade-in 1s ease-out;
  }
  .gawk-date-stamp {
    position: fixed; top: 20px; left: 24px; z-index: 2147483646;
    font-family: 'JetBrains Mono', monospace; font-size: 13px;
    color: rgba(100, 116, 139, 0.6); pointer-events: none;
    animation: gawk-fade-in 1s ease-out;
  }

  .gawk-cta-card {
    position: fixed; inset: 0; z-index: 2147483647;
    background: #06080a;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', 'DM Sans', -apple-system, sans-serif;
    pointer-events: none; padding: ${vertical ? "40px 24px" : "0"};
    animation: gawk-card-in 0.8s ease-out;
  }
  .gawk-cta-card__logo {
    font-size: ${ctaLogo}; font-weight: 700; color: #e2e8f0;
    letter-spacing: 6px; margin-bottom: 16px;
  }
  .gawk-cta-card__dot { color: rgba(45, 212, 191, 1); }
  .gawk-cta-card__tagline {
    font-size: ${ctaTag}; color: #64748b; margin-bottom: 40px;
    font-family: 'DM Sans', -apple-system, sans-serif; text-align: center;
  }
  .gawk-cta-card__actions {
    display: flex; flex-direction: ${ctaDir}; gap: ${vertical ? "16px" : "24px"}; align-items: center;
  }
  .gawk-cta-card__action {
    padding: 12px 32px; border-radius: 8px; font-size: 16px;
    font-weight: 600; letter-spacing: 1px;
  }
  .gawk-cta-card__action--primary {
    background: rgba(45, 212, 191, 0.15); border: 1px solid rgba(45, 212, 191, 0.4);
    color: rgba(45, 212, 191, 0.9);
  }
  .gawk-cta-card__action--secondary {
    background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8;
  }
  .gawk-cta-card__date {
    margin-top: 40px; font-size: 13px; color: #475569;
    font-family: 'JetBrains Mono', monospace;
  }

  .gawk-leaderboard {
    position: fixed; inset: 0; z-index: 2147483647;
    background: #06080a;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', 'DM Sans', -apple-system, sans-serif;
    pointer-events: none; padding: ${vertical ? "40px 24px" : "0"};
    animation: gawk-card-in 0.5s ease-out;
  }
  .gawk-leaderboard__label {
    font-size: 14px; font-weight: 600; color: rgba(45, 212, 191, 0.7);
    letter-spacing: 4px; text-transform: uppercase; margin-bottom: 12px;
  }
  .gawk-leaderboard__crown { font-size: ${vertical ? "36px" : "48px"}; margin-bottom: 8px; }
  .gawk-leaderboard__hero {
    font-size: ${lbHero}; font-weight: 700; color: #4ade80;
    margin-bottom: 4px; letter-spacing: 2px;
  }
  .gawk-leaderboard__hero-sub {
    font-size: ${lbHeroSub}; font-weight: 500; color: rgba(78, 205, 154, 0.7);
    margin-bottom: 40px; font-family: 'DM Sans', sans-serif;
  }
  .gawk-leaderboard__table {
    width: ${lbTableW}; border-collapse: separate; border-spacing: 0 6px;
  }
  .gawk-leaderboard__row td {
    padding: ${vertical ? "8px 12px" : "10px 16px"}; font-size: ${lbRowFont}; font-weight: 500;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
  }
  .gawk-leaderboard__row td:first-child {
    border-radius: 8px 0 0 8px; width: 50px; text-align: center;
    font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: ${lbRankFont}; color: #64748b;
  }
  .gawk-leaderboard__row td:nth-child(2) {
    font-family: 'DM Sans', sans-serif; font-weight: 600; color: #cbd5e1;
  }
  .gawk-leaderboard__row td:last-child {
    border-radius: 0 8px 8px 0; text-align: right;
    font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #94a3b8; font-size: ${lbValFont};
  }
  .gawk-leaderboard__row--1 td { background: rgba(74,222,128,0.08); border-color: rgba(74,222,128,0.25); }
  .gawk-leaderboard__row--1 td:first-child { color: #4ade80; }
  .gawk-leaderboard__row--1 td:nth-child(2) { color: #4ade80; font-weight: 700; }
  .gawk-leaderboard__row--1 td:last-child { color: #4ade80; }
  .gawk-leaderboard__row--4 td { background: rgba(45,212,191,0.06); border-color: rgba(45,212,191,0.2); }
  .gawk-leaderboard__row--4 td:first-child { color: rgba(45,212,191,0.8); }
  .gawk-leaderboard__row--4 td:nth-child(2) { color: rgba(45,212,191,0.9); }
  .gawk-leaderboard__row--4 td:last-child { color: rgba(45,212,191,0.8); }
  .gawk-leaderboard__source {
    margin-top: 32px; font-size: 14px; color: #64748b;
    font-family: 'JetBrains Mono', monospace;
  }

  @keyframes gawk-slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes gawk-fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes gawk-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes gawk-card-in {
    from { opacity: 0; transform: scale(0.97); }
    to { opacity: 1; transform: scale(1); }
  }
  .gawk-breathe-wipe {
    position: fixed; inset: 0; z-index: 2147483646;
    background: #06080a;
  }
`;
}

const OVERLAY_CSS = buildOverlayCSS(IS_VERTICAL);

// --- Page manipulation helpers ---

async function hideAllChrome(page: Page) {
  try {
    const rejectBtn = await page.$("button:has-text('Reject all')");
    if (rejectBtn) { await rejectBtn.click(); await page.waitForTimeout(500); }
  } catch { /* no consent banner */ }

  await page.evaluate(() => {
    const selectors = [
      // Left nav + icon bar
      ".ap-icon-nav",
      // Live ticker
      ".ap-live-ticker",
      // Filter panel (trigger + expanded forms)
      ".ap-filter-panel-trigger",
      ".ap-filter-panel--full",
      ".ap-filter-panel--icons",
      // Map legend + cursor glow + small labels
      ".ap-map-legend",
      ".ap-cursor-glow",
      ".ap-label-sm",
      // TopBar (fixed top, z-40 — contains tabs + logo + status pills)
      ".ap-tabs",
      // StatusBar (fixed, z-39, data-testid="global-status-bar")
      "[data-testid='global-status-bar']",
      // SubscribeModal / Daily Digest popup (fixed bottom-right, z-40)
      "[data-testid='subscribe-modal']",
      // Consent / cookie banners
      "[class*='consent'], [class*='Consent'], [class*='cookie'], [class*='Cookie']",
      // Toasts
      "[class*='toast'], [class*='Toast'], [class*='Toaster']",
      // Banners + footer
      "[class*='banner'], [class*='Banner']",
      "footer, [class*='privacy'], [class*='Privacy']",
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(function(el) {
        (el as HTMLElement).style.setProperty("display", "none", "important");
      });
    }

    // TopBar (fixed header, top:0, z-40) + HeroStrip (fixed div, top:76, z-38)
    // Hide all fixed-position elements in the top 150px — but skip gawk-injected overlays
    for (const tag of ["header", "div", "nav", "section"]) {
      document.querySelectorAll(tag).forEach(function(el) {
        if ((el as HTMLElement).className.startsWith("gawk-")) return;
        const style = window.getComputedStyle(el);
        if (style.position === "fixed" && el.getBoundingClientRect().top < 150 && el.getBoundingClientRect().height < 120) {
          (el as HTMLElement).style.setProperty("display", "none", "important");
        }
      });
    }

    document.querySelectorAll("[class*='z-50']").forEach(function(el) {
      const rect = el.getBoundingClientRect();
      if (rect.y > 800) (el as HTMLElement).style.setProperty("display", "none", "important");
    });

    document.querySelectorAll(".ap-panel-surface").forEach(function(el) {
      const rect = el.getBoundingClientRect();
      if (rect.y > 900) (el as HTMLElement).style.setProperty("display", "none", "important");
    });

    document.querySelectorAll("[class*='alert'], [class*='Alert']").forEach(function(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 200) (el as HTMLElement).style.setProperty("display", "none", "important");
    });
  });
}

async function navigateToPanel(page: Page, panelId: string): Promise<boolean> {
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
      return false;
    });
  }

  // Temporarily show nav to click, then re-hide
  await page.evaluate(() => {
    const nav = document.querySelector(".ap-icon-nav") as HTMLElement;
    if (nav) nav.style.setProperty("display", "flex", "important");
  });

  const clicked = await page.evaluate((target) => {
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
    return false;
  }, panelId);

  await page.waitForTimeout(300);

  // Re-hide nav
  await page.evaluate(() => {
    const nav = document.querySelector(".ap-icon-nav") as HTMLElement;
    if (nav) nav.style.setProperty("display", "none", "important");
  });

  return clicked;
}

async function showDataCard(page: Page, opts: {
  label: string;
  number: string;
  direction: "up" | "down" | "neutral";
  title: string;
  source: string;
}) {
  await page.evaluate((o) => {
    document.querySelectorAll(".gawk-data-card, .gawk-headline-card").forEach(el => el.remove());
    const arrow = o.direction === "up" ? "↑" : o.direction === "down" ? "↓" : "";
    const el = document.createElement("div");
    el.className = "gawk-data-card";
    el.innerHTML = `
      <div class="gawk-data-card__label">${o.label}</div>
      ${arrow ? `<div class="gawk-data-card__arrow gawk-data-card__arrow--${o.direction}">${arrow}</div>` : ""}
      <div class="gawk-data-card__number gawk-data-card__number--${o.direction}">${o.number}</div>
      <div class="gawk-data-card__title">${o.title}</div>
      <div class="gawk-data-card__source">${o.source}</div>
    `;
    document.body.appendChild(el);
  }, opts);
}

async function hideDataCard(page: Page) {
  await page.evaluate(() => {
    const el = document.querySelector(".gawk-data-card") as HTMLElement | null;
    if (el) {
      el.style.animation = "gawk-fade-out 0.5s ease-in forwards";
      setTimeout(() => el.remove(), 500);
    }
  });
}

async function showLowerThird(page: Page, segment: string, headline: string) {
  await page.evaluate(({ segment, headline }) => {
    document.querySelectorAll(".gawk-lower-third").forEach(el => el.remove());
    const el = document.createElement("div");
    el.className = "gawk-lower-third";
    el.innerHTML = `
      <div class="gawk-lower-third__segment">${segment}</div>
      <div class="gawk-lower-third__headline">${headline}</div>
    `;
    document.body.appendChild(el);
  }, { segment, headline });
}

async function hideLowerThird(page: Page) {
  await page.evaluate(() => {
    const el = document.querySelector(".gawk-lower-third") as HTMLElement | null;
    if (el) {
      el.style.animation = "gawk-fade-out 0.4s ease-in forwards";
      setTimeout(() => el.remove(), 400);
    }
  });
}

async function showHeadlineCard(page: Page, label: string, headline: string, source: string) {
  await page.evaluate(({ label, headline, source }) => {
    document.querySelectorAll(".gawk-headline-card, .gawk-data-card").forEach(el => el.remove());
    const el = document.createElement("div");
    el.className = "gawk-headline-card";
    el.innerHTML = `
      <div class="gawk-headline-card__label">${label}</div>
      <div class="gawk-headline-card__text">${headline}</div>
      <div class="gawk-headline-card__source">${source}</div>
    `;
    document.body.appendChild(el);
  }, { label, headline, source });
}

async function showLeaderboard(page: Page, opts: {
  label: string;
  heroName: string;
  heroSub: string;
  rows: { rank: number; name: string; value: string }[];
  source: string;
}) {
  await page.evaluate(function(o) {
    document.querySelectorAll(".gawk-leaderboard, .gawk-headline-card, .gawk-data-card").forEach(function(el) { el.remove(); });
    var rowsHtml = o.rows.map(function(r) {
      return '<tr class="gawk-leaderboard__row gawk-leaderboard__row--' + r.rank + '">' +
        '<td>' + r.rank + '</td><td>' + r.name + '</td><td>' + r.value + '</td></tr>';
    }).join("");
    var el = document.createElement("div");
    el.className = "gawk-leaderboard";
    el.innerHTML =
      '<div class="gawk-leaderboard__label">' + o.label + '</div>' +
      '<div class="gawk-leaderboard__crown">👑</div>' +
      '<div class="gawk-leaderboard__hero">' + o.heroName + '</div>' +
      '<div class="gawk-leaderboard__hero-sub">' + o.heroSub + '</div>' +
      '<table class="gawk-leaderboard__table">' + rowsHtml + '</table>' +
      '<div class="gawk-leaderboard__source">' + o.source + '</div>';
    document.body.appendChild(el);
  }, opts);
}

async function hideLeaderboard(page: Page) {
  await page.evaluate(function() {
    var el = document.querySelector(".gawk-leaderboard") as HTMLElement | null;
    if (el) {
      el.style.animation = "gawk-fade-out 0.5s ease-in forwards";
      setTimeout(function() { el!.remove(); }, 500);
    }
  });
}

async function showCTA(page: Page) {
  var dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  await page.evaluate(function(d) {
    document.querySelectorAll(".gawk-data-card, .gawk-headline-card, .gawk-leaderboard").forEach(function(e) { e.remove(); });
    var el = document.createElement("div");
    el.className = "gawk-cta-card";
    el.innerHTML =
      '<div class="gawk-cta-card__logo">gawk<span class="gawk-cta-card__dot">.</span>dev</div>' +
      '<div class="gawk-cta-card__tagline">Track what actually matters in AI.</div>' +
      '<div class="gawk-cta-card__actions">' +
        '<div class="gawk-cta-card__action gawk-cta-card__action--primary">Subscribe for daily briefs</div>' +
        '<div class="gawk-cta-card__action gawk-cta-card__action--secondary">Bookmark gawk.dev</div>' +
      '</div>' +
      '<div class="gawk-cta-card__date">' + d + '</div>';
    document.body.appendChild(el);
  }, dateStr);
}

async function showWatermark(page: Page) {
  const date = new Date().toISOString().slice(0, 10);
  await page.evaluate((d) => {
    if (document.querySelector(".gawk-watermark")) return;
    const w = document.createElement("div");
    w.className = "gawk-watermark";
    w.textContent = "gawk.dev";
    document.body.appendChild(w);
    const dt = document.createElement("div");
    dt.className = "gawk-date-stamp";
    dt.textContent = d;
    document.body.appendChild(dt);
  }, date);
}

async function mapFlyTo(page: Page, lat: number, lng: number, zoom: number, durationSec: number) {
  await page.evaluate(({ lat, lng, zoom, dur }) => {
    if ((window as any).__map) {
      (window as any).__map.flyTo([lat, lng], zoom, { duration: dur });
    }
  }, { lat, lng, zoom, dur: durationSec });
}

async function showBreatheWipe(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll(".gawk-breathe-wipe").forEach(el => el.remove());
    const el = document.createElement("div");
    el.className = "gawk-breathe-wipe";
    document.body.appendChild(el);
  });
}

async function hideBreatheWipe(page: Page) {
  await page.evaluate(() => {
    const el = document.querySelector(".gawk-breathe-wipe") as HTMLElement | null;
    if (el) {
      el.style.animation = "gawk-fade-out 0.3s ease-in forwards";
      setTimeout(() => el.remove(), 300);
    }
  });
}

// --- Segment plan builder ---

function segmentLabel(seg: string): string {
  const map: Record<string, string> = {
    hook: "BREAKING", lead: "TOP STORY", story: "IN FOCUS",
    community: "COMMUNITY", radar: "ON THE RADAR",
    intro: "GAWK DAILY", outro: "GAWK DAILY",
  };
  return map[seg] ?? seg.toUpperCase();
}

// --- Script-locked story definitions ---

type LockedStory = {
  id: string;
  segment: string;
  headline: string;
  type: "leaderboard" | "data-card" | "lower-third";
  scene: SceneDirection;
  holdSec: number;
  dataCard?: {
    label: string;
    number: string;
    direction: "up" | "down" | "neutral";
    title: string;
    source: string;
  };
  leaderboard?: {
    label: string;
    heroName: string;
    heroSub: string;
    rows: { rank: number; name: string; value: string }[];
    source: string;
  };
};

const SCRIPT_PATH = resolve(ROOT, "data/script-locked.json");

function loadLockedScript(): LockedStory[] | null {
  if (!existsSync(SCRIPT_PATH)) return null;
  return JSON.parse(readFileSync(SCRIPT_PATH, "utf-8"));
}

// --- Main ---

async function main() {
  const lockedScript = loadLockedScript();
  let narratives: Narrative[] = [];

  if (lockedScript) {
    console.log(`Script-locked mode: ${lockedScript.length} stories from data/script-locked.json\n`);
  } else if (existsSync(CURATED)) {
    const config = FORMAT_CONFIGS[FORMAT] ?? FORMAT_CONFIGS.youtube;
    const curated: CurationResult = JSON.parse(readFileSync(CURATED, "utf-8"));
    narratives = curated.narratives.slice(0, config.maxItems);
    console.log(`Curated mode: ${FORMAT} | ${narratives.length} stories\n`);
  } else {
    console.error(`No script found. Create data/script-locked.json or data/curated.json`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const fmtConfig = FORMAT_CONFIGS[FORMAT] ?? FORMAT_CONFIGS.youtube;
  const VW = fmtConfig.width;
  const VH = fmtConfig.height;

  const browser = await chromium.launch({
    headless: true,
    args: ["--run-all-compositor-stages-before-draw", "--disable-checker-imaging"],
  });
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    recordVideo: { dir: OUT_DIR, size: { width: VW, height: VH } },
  });

  const page = await context.newPage();

  // Pre-accept cookies BEFORE page loads to prevent consent banner flash
  await page.addInitScript(() => {
    document.cookie = "cookie_consent=accepted; path=/; max-age=86400";
    try { localStorage.setItem("cookie_consent", "accepted"); } catch {}
  });

  // --- PRE-LOAD (before recording starts) ---
  const preloadStart = Date.now();
  console.log("Pre-loading gawk.dev...");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve());
    });
  });

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

  // Set up: hide everything, navigate to map, inject styles
  await hideAllChrome(page);
  await navigateToPanel(page, "globe");
  await page.addStyleTag({ content: OVERLAY_CSS });
  await hideAllChrome(page); // re-hide after nav click

  if (mapReady) {
    await page.evaluate(() => {
      (window as any).__map.setView([50, 15], 3, { animate: false }); // Start on Europe
    });
  }

  await page.waitForTimeout(500);

  // --- RECORDING STARTS ---
  // The video begins here. Map is showing Europe, all chrome hidden.
  const preloadSec = (Date.now() - preloadStart) / 1000;
  console.log(`  Pre-load took ${preloadSec.toFixed(1)}s (will be trimmed in compositor)`);

  const manifest: ManifestEntry[] = [];
  let clock = 0;

  await showWatermark(page);

  if (lockedScript) {
    // === SCRIPT-LOCKED MODE ===
    // Cold open: map in motion for 1 second
    console.log("  [INTRO    ] Cold open — map in motion — 1s");
    const introStart = clock;
    if (mapReady) {
      await mapFlyTo(page, 48, 10, 4, 1);
    }
    await page.waitForTimeout(1000);
    clock += 1;
    manifest.push({
      id: "intro", segment: "intro", headline: "Cold open",
      scene: "globe", holdSec: 1, startSec: introStart, endSec: clock,
    });

    for (let idx = 0; idx < lockedScript.length; idx++) {
      const story = lockedScript[idx];
      const segStart = clock;

      if (story.type === "leaderboard" && story.leaderboard) {
        console.log(`  [${story.segment.toUpperCase().padEnd(9)}] LEADERBOARD: ${story.headline.slice(0, 45)} — ${story.holdSec}s`);
        await showLeaderboard(page, story.leaderboard);
        await page.waitForTimeout(story.holdSec * 1000);
      } else if (story.type === "data-card" && story.dataCard) {
        console.log(`  [${story.segment.toUpperCase().padEnd(9)}] DATA CARD: ${story.dataCard.number} — ${story.headline.slice(0, 45)} — ${story.holdSec}s`);
        await showDataCard(page, story.dataCard);
        await page.waitForTimeout(story.holdSec * 1000);
      } else {
        console.log(`  [${story.segment.toUpperCase().padEnd(9)}] HEADLINE: ${story.headline.slice(0, 50)} — ${story.holdSec}s`);
        const sceneSource = story.scene === "wire" ? "Community" : story.scene === "models" ? "OpenRouter" : "Source";
        const dateLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" });
        await showHeadlineCard(page, segmentLabel(story.segment), story.headline, `${sceneSource} · ${dateLabel}`);
        await page.waitForTimeout(story.holdSec * 1000);
      }

      clock += story.holdSec;
      manifest.push({
        id: story.id, segment: story.segment, headline: story.headline,
        scene: story.scene, holdSec: story.holdSec, startSec: segStart, endSec: clock,
      });

      // Solid colour wipe between stories (1 second)
      // Wipe stays until the next graphic covers it (higher z-index)
      if (idx < lockedScript.length - 1) {
        console.log("  [BREATHE  ] Wipe — 1s");
        const breatheStart = clock;
        await showBreatheWipe(page);
        await page.waitForTimeout(1000);
        clock += 1;
        manifest.push({
          id: `breathe-${idx}`, segment: "wipe", headline: "Colour wipe",
          scene: "wipe", holdSec: 1, startSec: breatheStart, endSec: clock,
        });
      }
    }

    // === CTA — 4 seconds ===
    console.log("  [OUTRO    ] CTA — 4s");
    const outroStart = clock;
    await showCTA(page);
    await page.waitForTimeout(4000);
    clock += 4;
    manifest.push({
      id: "outro", segment: "outro", headline: "Outro",
      scene: "globe", holdSec: 4, startSec: outroStart, endSec: clock,
    });

  } else {
    // === LEGACY CURATED MODE ===
    const MAP_REGIONS = [
      { name: "Europe", lat: 50, lng: 15, zoom: 3 },
      { name: "North America", lat: 40, lng: -95, zoom: 3 },
      { name: "Asia", lat: 30, lng: 105, zoom: 3 },
      { name: "Global", lat: 20, lng: 0, zoom: 2 },
    ];

    console.log("  [INTRO    ] Map fly-to Europe — 5s");
    const introStart = clock;
    if (mapReady) {
      await mapFlyTo(page, 48, 10, 4, 3);
    }
    await page.waitForTimeout(5000);
    clock += 5;
    manifest.push({
      id: "intro", segment: "intro", headline: "Intro",
      scene: "globe", holdSec: 5, startSec: introStart, endSec: clock,
    });

    let regionIdx = 0;

    for (let idx = 0; idx < narratives.length; idx++) {
      const n = narratives[idx];
      const scene = sourceToPanel(n.events[0]?.source ?? "");
      const lead = n.events[0];
      const m = lead?.metrics ?? {};

      const hasKeyNumber = (
        (m.deltaPct !== undefined && Math.abs(m.deltaPct) > 20) ||
        (m.rank !== undefined && m.previousRank !== undefined && Math.abs(m.previousRank - m.rank) > 10) ||
        (m.stars !== undefined && m.stars > 50)
      );

      if (idx > 0 && idx % 4 === 0 && mapReady) {
        const region = MAP_REGIONS[regionIdx % MAP_REGIONS.length];
        regionIdx++;
        const mapStart = clock;
        await hideDataCard(page);
        await hideLowerThird(page);
        await hideAllChrome(page);
        await navigateToPanel(page, "globe");
        await page.waitForTimeout(200);
        await mapFlyTo(page, region.lat, region.lng, region.zoom, 2);
        await page.waitForTimeout(3000);
        clock += 3;
        manifest.push({
          id: `map-${regionIdx}`, segment: "map", headline: `Fly to ${region.name}`,
          scene: "globe", holdSec: 3, startSec: mapStart, endSec: clock,
        });
      }

      const segStart = clock;

      if (hasKeyNumber && idx < 6) {
        let number = "";
        let direction: "up" | "down" | "neutral" = "neutral";
        let label = segmentLabel(n.segment);
        let source = "";

        if (m.deltaPct !== undefined) {
          const abs = Math.abs(m.deltaPct);
          if (abs > 80 && m.deltaPct < 0) { number = "↓↓"; label = "COLLAPSED"; }
          else { number = `${abs.toFixed(0)}%`; }
          direction = m.deltaPct < 0 ? "down" : "up";
          source = "Source: Package download data";
        } else if (m.rank !== undefined && m.previousRank !== undefined) {
          const moved = Math.abs(m.previousRank - m.rank);
          number = `${moved}`;
          direction = m.previousRank > m.rank ? "up" : "down";
          label = `RANK ${direction === "up" ? "UP" : "DOWN"}`;
          source = "Source: OpenRouter usage leaderboard";
        } else if (m.stars !== undefined) {
          number = `${m.stars}`;
          direction = "up";
          label = "TRENDING";
          source = "Source: GitHub";
        }

        await showDataCard(page, { label, number, direction, title: n.headline.slice(0, 70), source });
        await page.waitForTimeout(4500);
        await hideDataCard(page);
        await page.waitForTimeout(1500);
        clock += 6;
      } else {
        if (scene !== "globe") { await navigateToPanel(page, scene); await page.waitForTimeout(400); }
        await hideAllChrome(page);
        await showLowerThird(page, segmentLabel(n.segment), n.headline.slice(0, 80));
        await page.waitForTimeout(6000);
        await hideLowerThird(page);
        await page.waitForTimeout(1500);
        clock += 8;
      }

      manifest.push({
        id: n.id, segment: n.segment, headline: n.headline,
        scene, holdSec: clock - segStart, startSec: segStart, endSec: clock,
      });
      await page.waitForTimeout(300);
      clock += 0.3;
    }

    console.log("  [OUTRO    ] Global map + CTA card — 10s");
    const outroStart = clock;
    await hideLowerThird(page);
    await hideDataCard(page);
    await hideAllChrome(page);
    await navigateToPanel(page, "globe");
    await page.waitForTimeout(200);
    if (mapReady) { await mapFlyTo(page, 20, 0, 2, 2); }
    await page.waitForTimeout(3000);
    await showCTA(page);
    await page.waitForTimeout(5000);
    await page.evaluate(function() {
      var el = document.querySelector(".gawk-cta-card") as HTMLElement;
      if (el) el.style.animation = "gawk-fade-out 1.5s ease-in forwards";
    });
    await page.waitForTimeout(1500);
    clock += 10;
    manifest.push({
      id: "outro", segment: "outro", headline: "Outro",
      scene: "globe", holdSec: 12, startSec: outroStart, endSec: clock,
    });
  }

  // === SAVE ===
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

  const manifestPath = resolve(ROOT, `data/video-manifest-${FORMAT}.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  writeFileSync(
    resolve(ROOT, `data/video-trim-${FORMAT}.json`),
    JSON.stringify({ preloadSec: Math.round(preloadSec * 10) / 10 })
  );
  console.log(`Manifest saved: ${manifestPath}`);
  console.log(`\nTotal segments: ${manifest.length}`);
  console.log(`Estimated duration: ${Math.round(clock)}s`);
  console.log(`\nNext: npx tsx scripts/video/generate-narration.ts --format ${FORMAT}`);
}

main().catch((e) => {
  console.error("Recording failed:", e);
  process.exit(1);
});
