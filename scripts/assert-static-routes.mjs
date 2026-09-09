#!/usr/bin/env node
/**
 * Fail the build if a route that must be statically cached has gone dynamic.
 *
 * This exists because of a real production incident. `@upstash/redis` issues
 * every call with `cache: "no-store"` (`nodejs.mjs`:
 * `cache: configOrRequester.cache ?? "no-store"`), and a single no-store fetch
 * inside a server component opts the WHOLE route out of static generation.
 * When the homepage started server-rendering its status numbers, it read
 * sample history from Redis and `/` silently flipped from `○` to `ƒ`.
 *
 * The part that makes it worth a CI job rather than a code review: it could
 * not be reproduced locally. A dev machine has no `UPSTASH_*`, so
 * `hasRedisConfigured()` short-circuits and the Redis call is never made. The
 * identical commit built `○` locally and `ƒ` on Vercel, so three separate
 * local verifications of the caching claim all passed while production served
 * `x-vercel-cache: MISS` on every request — rendering per visitor at ~530ms
 * TTFB and spending ~7 Upstash commands each against a 10k/day budget.
 *
 * So this check is only meaningful when run after a build that had the
 * production-shaped env present (see ci.yml). Dummy credentials are enough:
 * the call only has to be ATTEMPTED to change staticness.
 */
import { readFileSync } from "node:fs";

/**
 * Routes that must stay prerendered. Add one here only with the reason, and
 * never "fix" a failure by deleting a line — the failure is the point.
 */
const MUST_BE_STATIC = [
  {
    route: "/",
    why: "the homepage's numbers must reach crawlers without every visitor paying a render",
  },
];

const manifestPath = ".next/prerender-manifest.json";

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (err) {
  console.error(
    `✗ could not read ${manifestPath} — run \`npm run build\` first.\n  ${err.message}`,
  );
  process.exit(1);
}

const dynamicRoutes = Object.keys(manifest.dynamicRoutes ?? {});
const failures = [];

for (const { route, why } of MUST_BE_STATIC) {
  const entry = manifest.routes?.[route];
  if (!entry) {
    failures.push(
      `${route} is NOT prerendered (absent from routes[]). It rendered as ƒ.\n` +
        `    why it matters: ${why}\n` +
        `    likely cause:   something on this route's render path fetched with\n` +
        `                    cache: "no-store" — @upstash/redis does this by default.`,
    );
    continue;
  }
  if (entry.initialRevalidateSeconds === false) {
    failures.push(
      `${route} is prerendered but never revalidates (initialRevalidateSeconds: false).\n` +
        `    why it matters: ${why}`,
    );
    continue;
  }
  if (dynamicRoutes.includes(route)) {
    failures.push(`${route} appears in dynamicRoutes.\n    why it matters: ${why}`);
    continue;
  }
  console.log(
    `✓ ${route} — prerendered, revalidate ${entry.initialRevalidateSeconds}s`,
  );
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} route(s) lost static rendering:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(`\n✓ all ${MUST_BE_STATIC.length} required route(s) still static`);
