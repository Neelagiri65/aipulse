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

---

## Addendum — external review (folded in session 26)

External review challenged the spec on component discipline. The folded items below become part of the spec contract; the rejected items are logged so they don't resurface.

### Principle 1.5 — PANEL CHROME IS ONE COMPONENT

`src/components/chrome/Win.tsx` is the floating-panel frame. Every panel rendered on the map / globe stage (wire, tools, models, research, benchmarks, labs, regional-wire) MUST mount inside a `Win`. No forked panel frames. Chrome consistency is a trust signal — a stack of windows that don't share a titlebar reads as "collection of features", not a single product.

`Win` carries three contracts the rest of the app depends on:

- Titlebar triple: **coloured dot · uppercase-mono title · — □ ×**. 14px title (session-24 type scale), 6px dot. Never inline a bespoke titlebar in a panel body.
- `accent` prop: one of `teal | amber | green | violet | orange`. Panel identity, not state. The stat bar carries state.
- `statBar` slot: one-line master-detail row (10px mono) rendered under the titlebar when provided.

### Accent palette (identity, never state)

| Panel           | Accent  | Reason                                              |
| --------------- | ------- | --------------------------------------------------- |
| wire            | teal    | primary "live pulse" identity (GH events)           |
| tools           | green   | tool-health is the one semantic green layer         |
| models          | teal    | model catalog sits alongside the live pulse         |
| research        | violet  | arXiv/research papers — matches labs-adjacent hue   |
| benchmarks      | amber   | leaderboards are delta/rank-sensitive → amber       |
| labs            | violet  | labs + research share the academic/violet family    |
| regional-wire   | orange  | RSS layer matches the orange dots on the map        |

Accents are static per panel. Even when Tools has a degraded tool, the accent dot stays green — the stat bar reports "`5 OPERATIONAL · 1 DEGRADED`", and the global `StatusBar` / `TopBar` carry the fleet-level state.

### FIX-13 — MASTER-DETAIL STAT BAR (new)

Every panel renders a one-line summary row between the titlebar and the content:

- Tools: `"N OPERATIONAL · N DEGRADED · N OUTAGE"` (suppress zero segments)
- AI Labs: country counts, top 5 `"9 CN · 10 US · 4 EU · 3 CA · 1 IL"`
- Research: category counts `"12 cs.AI · 8 cs.LG"` (top 3 by volume)
- Wire (LiveFeed panel): `"N GH · N HN · N RSS"` — extends the existing Wire-tab header pattern
- Regional Wire: `"N SOURCES · N ARTICLES · N PUBLISHERS"`
- Benchmarks: `"Top Elo: N · M models · published YYYY-MM-DD"`
- Models: `"N providers · N models · N flagships"` (flagships = provider.flagship === true)

Empty state: render `—` when the upstream data is undefined. Never fabricate counts.

### FIX-14 — FILTER STRIP IS PERSISTENT

The right-edge `FilterPanel` is part of the chrome, not a Win-toggle. Never dismissible.

- ≥1440px: full 220px width, labels + checkboxes.
- <1440px: icon-only 44px rail (colour-dot per layer, tooltip on hover, click still toggles).
- Collapsed below 768px by the existing mobile gate (no change).

### FIX-15 — KEYBOARD SHORTCUTS

Dev-audience shortcuts, window-level:

- `Esc` — close the topmost open panel. Does nothing if no panel is open. Must not clobber the Globe's event-detail card Esc (card Esc binds while a card is selected).
- `1`–`9` — toggle the nth nav item (skipping `soon` items). Same behaviour as clicking the nav button.
- `/` — deferred. No global search target exists yet. Revisit when one lands.

### FIX-02 amendment — "Metrics pending" as badge, not hidden

Session-23 hid the "additional metrics pending dedicated sources" line entirely. External review is right: hiding causes layout shift when data lands. Re-introduce as a 10px mono badge at opacity 0.5, sharing the same inline metadata style as source citations.

### REJECTED (logged so they don't resurface)

- **Coordinate readout in bottom-right** (World Monitor's `32° 4.85 N`). Cosmetic command-centre flavour; blocks nothing; defer indefinitely.
- **Bottom ticker restyle** to a pulsing-LED effect. The current ticker works; visual polish for its own sake is out of scope.
- **FIX-11 proper mobile** (distinct mobile layout). Session-24 mobile gate + "Best viewed on desktop" is the decided answer. Do not half-build a mobile experience.

### Implementation order (session 26)

Four commits on one branch (`feat/panel-chrome-v2`):

1. `feat(chrome): Win accent + stat-bar slot` — extend Win, update all 7 call sites. No stat bars rendered yet.
2. `feat(chrome): panel stat bars` — per-panel data derivation + render.
3. `feat(chrome): filter strip <1440px icon-only` — responsive variant.
4. `feat(chrome): keyboard shortcuts` — Esc + 1-9.

Playwright visual smoke after each commit (or at PR end — same budget).
