# AI Pulse — Visual smoke test harness

Playwright-driven click-through of every view, panel, and key
interaction on the dashboard. Outputs a deterministic trail of
screenshots under `test-results/screenshots/` for manual review and
regression-eyeballing.

## Run

```bash
# Against the live Vercel deploy (default)
npm run test:visual

# Against local `next dev`
npm run dev            # in another terminal, then:
npm run test:visual:local

# Headed (watch the browser drive itself)
npm run test:visual:headed

# Open the last HTML report
npm run test:visual:report
```

Screenshots land in `test-results/screenshots/`, sequentially numbered
in capture order. The Playwright HTML report lives in
`playwright-report/`. Both directories are gitignored — they're
per-run artefacts, not code.

## Targeting a specific test

```bash
# By grep on the test title
npx playwright test -g "Benchmarks panel opens"

# By file
npx playwright test tests/visual/02-dashboard-panels.spec.ts

# With a base URL override
LOCAL_URL=http://localhost:3000 npx playwright test -g "HN orange pill"
```

## Files

```
tests/visual/
  _helpers.ts                    shared open/switch/wait helpers
  01-dashboard-views.spec.ts     Map / Wire / Globe tab screenshots
  02-dashboard-panels.spec.ts    Wire / Tools / Models / Research / Benchmarks
  03-interactions.spec.ts        cluster-click EventCard, HN pill, metrics
  04-chrome.spec.ts              TopBar, LeftNav, clock, sources count
  05-audit.spec.ts               /audit page smoke
```

## Readiness contract

Each spec waits for a concrete DOM signal before screenshotting:

- **Map**: `.leaflet-container` visible + `.leaflet-marker-icon` attached + 1.2s tile paint.
- **Globe**: `canvas` visible + 3.5s WebGL warm-up (headless GPU is slow).
- **Wire**: `The Wire` header + either a row `<li>` or the "No rows" empty state.
- **Panels**: `.ap-win` with matching title fragment.
- **Benchmarks**: `table` inside the panel + exactly 20 `tbody tr` rows + 7 column headers.
- **EventCard**: `role="dialog"` with `aria-label=/event(s)? in this region/`.
- **HN pill**: `span` matching `/^HN · \d+/` + computed `background-color === rgb(255, 102, 0)`.

## Why a smoke harness, not a pixel-diff suite

AI Pulse is an observatory — every number on screen comes from live
upstream data, which *moves*. Pixel-exact regression would fail every
run as the globe rotates, marker clusters re-bin, and the UTC clock
ticks. The suite instead asserts structural invariants (panel opens,
20 rows render, HN pill is orange) and archives a screenshot trail for
eyeballing.

When the user asks "screenshot the current state", run
`npm run test:visual` and hand over the `test-results/screenshots/`
folder. That's the whole design goal.

## Adding a new test

1. Decide which spec file the test belongs in. Prefer adding to an
   existing describe-block over creating a new spec file unless the
   surface is genuinely new (e.g. a whole new tab).
2. Use `openDashboard(page)` + `switchTab(page, ...)` + an appropriate
   `waitFor*Ready(page)` helper. Do **not** sleep on fixed timeouts for
   app state — add a specific DOM wait. Fixed timeouts are only
   acceptable for WebGL texture paint and similar non-DOM signals.
3. Use `shot(page, "descriptive-name")` to save the screenshot. Names
   get an auto-incrementing numeric prefix so the folder sorts in
   capture order.
4. Keep assertions to structural invariants (visible / count / text
   match), not pixel positions or animation state.

## Known caveats

- First run against cold Vercel is slow — allow ~90s for the first
  spec to warm the deploy. Subsequent runs reuse CDN caches.
- Globe headless rendering flakes ~5% of the time on first frame. The
  3.5s WebGL warm-up in `waitForGlobeReady` covers most of it. If it
  bites, rerun the single spec: `npx playwright test -g "@globe"`.
- The cluster-click test will fall back to a leaf marker if the
  current viewport has zero cluster bubbles (density varies with
  upstream event volume). Both paths exercise the same EventCard code
  path, so the assertion still holds.
