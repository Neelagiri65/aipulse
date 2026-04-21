# Design spec v2 — AI Pulse UI/UX overhaul

## Problem summary

AI Pulse has the data infrastructure of a production observatory (23 sources, 8 crons, 200+ tests) but the UI of a prototype. Multiple panels overlap when opened simultaneously, maximised views crop content, placeholder text is visible, font sizes are inconsistent, and the overall layout lacks the information hierarchy that makes World Monitor scannable at a glance.

## Design principles (extracted from World Monitor)

1. THE MAP IS THE PRODUCT. The map occupies 100% of the viewport. Everything else floats on top. The map is never obscured by a full-screen takeover — panels are windows, not pages.

2. ONE PANEL AT A TIME (on small viewports). On desktop (>1440px), max 2 panels side by side. On laptop (1024-1440px), one panel at a time — clicking a new nav item closes the current one. This prevents the overlap mess in screenshot 2.

3. PANELS ARE INFORMATION-DENSE, NOT SPACIOUS. World Monitor fits 20+ items in a panel without feeling cramped because it uses tight line-height (1.2), small but readable font sizes (11-12px for data, 13px for labels), and minimal padding (8px). AI Pulse's panels have too much whitespace between rows.

4. VISUAL HIERARCHY THROUGH TYPOGRAPHY, NOT COLOUR. World Monitor uses 3 font sizes consistently: 11px monospace for data values, 13px for labels and descriptions, 16px for panel titles. Never more than 3 sizes on screen at once.

5. COLOUR IS SEMANTIC, NOT DECORATIVE. Green = operational/healthy. Amber = degraded/warning. Red = outage/critical. Teal = informational. Orange = HN/discussion. Violet = labs. That's the full palette. No colour is used without meaning.

6. EVERY NUMBER HAS A SOURCE CITATION. Already implemented in AI Pulse — this is the trust contract. Maintain it.

## Specific fixes (priority order)

### P0 — Blocking share

**FIX-01: SINGLE-PANEL MODE**
- On viewport < 1440px: clicking any nav item closes ALL other panels, then opens the clicked one. Toggle behaviour — clicking the active nav item closes it.
- On viewport >= 1440px: max 2 panels open. Third click closes the oldest.
- Implement via a panelStack state in Dashboard.tsx. Max length = 1 (or 2 on wide screens).

**FIX-02: TOOL HEALTH MAXIMISE**
- Screenshot 4 shows cropped tool names at left edge, visible "ADDITIONAL METRICS PENDING DEDICATED SOURCES" placeholder text, and sparklines touching the panel border.
- Fix: when maximised, panel should be 80% viewport width, centred, with proper padding. Tool cards in a 2-column grid (not stacked vertically). Hide placeholder text entirely — show only tools that have real data. If a tool has no dedicated metrics, show only the status badge and sparkline, no explanatory text.

**FIX-03: AI LABS CLICK TARGETS**
- Currently links to Wikipedia. Must link to each lab's primary website (openai.com, anthropic.com, deepmind.google, ai.meta.com, etc.). Already flagged and supposedly fixed in PR #5 — verify it's actually deployed.

**FIX-04: REGIONAL WIRE DATA PROVENANCE**
- Each article row must show the RSS source URL. Click opens the original article, not an intermediate card. Already addressed in PR #5 — verify deployment.

### P1 — Visual polish

**FIX-05: FONT SIZE STANDARDISATION**
Adopt a strict 3-tier type scale:
- Panel titles: 13px, font-weight 500, monospace, uppercase, letter-spacing 0.5px
- Row labels / descriptions: 12px, font-weight 400, sans-serif
- Data values / metrics: 14px, font-weight 500, monospace
- Timestamp / source citations: 10px, font-weight 400, monospace, opacity 0.6
Never use font sizes outside these 4 values in any panel.

**FIX-06: PANEL DENSITY**
- Reduce row padding from current ~12px to 6px vertical, 10px horizontal
- Reduce gap between panel title bar and first row from ~16px to 8px
- Wire rows: tighter line-height (1.3 not 1.6)
- Benchmarks table: reduce cell padding to 4px 8px
- These changes alone will make panels feel 30% more professional

**FIX-07: WIRE TIMESTAMP PRECISION**
- Show relative time with minute precision for items < 1h old: "3m", "17m", "42m"
- Show hour precision for 1-24h: "2h", "8h", "23h"
- Use the event's source timestamp (GitHub created_at, HN created_at_i), not the ingest timestamp
- Currently showing "44m" for a block of events — this is batch ingest time leaking through

**FIX-08: METRIC CARDS STANDARDISATION**
- Bottom metric cards have inconsistent sizing between the 4 summary cards (AI-CFG Events, AI-CFG Share, Events/Window, Tools Ops) and the 6 detail cards below
- Standardise: all cards same height, same font treatment, same border radius
- Source citation line: 10px monospace, same opacity treatment across all cards

**FIX-09: STATUS BAR (NEW)**
- Add a single-line status bar between the top nav and the map: "4/5 OPERATIONAL · 1 DEGRADED · 23 SOURCES · LIVE"
- Green when all tools operational, amber when any degraded, red when any outage
- This gives instant system health without opening the Tools panel

### P2 — Nice to have

**FIX-10: SKELETON SCREENS**
- Replace all "loading..." text with CSS skeleton placeholders (pulsing grey bars matching the final content shape)
- Wire rows: 3 skeleton rows with title-length bars
- Metric cards: skeleton number + label
- Panel content: skeleton list matching row count

**FIX-11: MOBILE VIEWPORT**
- Add proper viewport meta tag if missing
- At < 768px: hide the map, show only THE WIRE as a full-screen feed with left nav as a bottom tab bar
- At < 768px: add "Best viewed on desktop" notice on first visit (dismissable, stored in localStorage)

**FIX-12: GLOBAL STATUS BAR WITH INCIDENT BANNER**
- When any tool has an active incident, show a slim amber/red banner below the status bar: "MONITORING: GitHub Copilot — Partial degradation for code scanning · 9h ago"
- Click opens the Tools panel focused on that tool
- Dismiss with × but re-shows if incident escalates

Implement P0 fixes first. Commit each separately. Run Playwright after P0 to verify no regressions. Then P1 as a second branch if time permits. P2 is next session.
