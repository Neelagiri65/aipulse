#!/usr/bin/env node
/**
 * Runtime render smoke: start the built app against a Redis stand-in and
 * request the ISR routes the way a visitor does.
 *
 * `assert-static-routes.mjs` reads the build manifest. That cannot see the
 * failure this one is for: a route with generateStaticParams is `●` in the
 * manifest no matter what, and only throws "Page changed from static to
 * dynamic at runtime" when a real request renders it on demand — which is how
 * every /digest/<date> page served 500 on prod after a green CI (PR #135).
 *
 * Expectations are the trust contract, not a wish list: a second hit on an
 * archived issue must be a cache HIT, an unknown date must 404 (never 500),
 * and the hub, sitemap and homepage must answer 200.
 */
import { spawn } from "node:child_process";
import { startMockUpstash, DATES } from "./ops/mock-upstash.mjs";

const REDIS_PORT = 7777;
const APP_PORT = Number(process.env.PORT ?? 3999);
const BASE = `http://127.0.0.1:${APP_PORT}`;

const CHECKS = [
  { path: `/digest/${DATES[1]}`, status: 200 },
  { path: `/digest/${DATES[1]}`, status: 200, cache: "HIT", why: "an archived issue is immutable; the 2nd hit must come from the cache" },
  { path: "/digest", status: 200 },
  { path: "/sitemap.xml", status: 200 },
  { path: "/digest/2026-01-01", status: 404, why: "unknown date → 404, never a 500" },
  { path: "/", status: 200 },
];

async function waitFor(url, ms = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`app did not answer at ${url} within ${ms}ms`);
}

// Hard ceiling so a hung app can never hang CI (the first run of this script
// did exactly that on ubuntu: `npx` swallowed SIGTERM, the orphaned next-server
// kept our stdout pipe open, and the step never ended).
const WATCHDOG_MS = 180_000;
const watchdog = setTimeout(() => {
  console.error(`✗ runtime smoke exceeded ${WATCHDOG_MS / 1000}s — killing everything`);
  shutdown(1);
}, WATCHDOG_MS);

const redis = await startMockUpstash(REDIS_PORT);
// Spawn the next binary directly, in its own process group, so one kill
// reaches the server and not just a wrapper.
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${REDIS_PORT}`, UPSTASH_REDIS_REST_TOKEN: "runtime-smoke" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});

function shutdown(code) {
  clearTimeout(watchdog);
  try {
    process.kill(-app.pid, "SIGTERM");
  } catch {}
  try {
    redis.closeAllConnections?.();
    redis.close();
  } catch {}
  // Explicit: never rely on the event loop draining while a child's pipe may
  // still be open.
  setTimeout(() => process.exit(code), 300).unref();
  process.exitCode = code;
}
let appLog = "";
app.stdout.on("data", (d) => (appLog += d));
app.stderr.on("data", (d) => (appLog += d));

let failures = 0;
try {
  await waitFor(`${BASE}/`);
  for (const c of CHECKS) {
    const r = await fetch(`${BASE}${c.path}`, { redirect: "manual" });
    const cache = r.headers.get("x-nextjs-cache") ?? "-";
    const okStatus = r.status === c.status;
    const okCache = !c.cache || cache === c.cache;
    const ok = okStatus && okCache;
    if (!ok) failures++;
    console.log(`${ok ? "✓" : "✗"} ${c.path.padEnd(22)} ${r.status} ${cache.padEnd(6)} expected ${c.status}${c.cache ? ` ${c.cache}` : ""}${!ok && c.why ? `\n    why: ${c.why}` : ""}`);
  }
} catch (e) {
  failures++;
  console.error(`✗ ${e.message}`);
}

const runtimeErrors = appLog.split("\n").filter((l) => /Error|couldn't be rendered|static to dynamic/.test(l));
if (runtimeErrors.length) {
  failures++;
  console.error(`\n✗ ${runtimeErrors.length} error line(s) in the app log:`);
  for (const l of [...new Set(runtimeErrors)].slice(0, 6)) console.error(`    ${l.trim().slice(0, 160)}`);
}

if (failures) {
  console.error(`\n✗ runtime render smoke failed (${failures}). A route on this list renders per request, throws, or 500s\n  when its Redis read succeeds — the state a local build without UPSTASH_* cannot show you.`);
  shutdown(1);
} else {
  console.log("\n✓ runtime render smoke passed");
  shutdown(0);
}
