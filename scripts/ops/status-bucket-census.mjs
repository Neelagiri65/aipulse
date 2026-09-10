#!/usr/bin/env node
/**
 * Census `/api/v1/status` day-buckets by `worstStatus`, and optionally wait for
 * a deploy to change the answer.
 *
 * WHY THIS EXISTS
 *
 * `bucketToDays` initialises every day to `worstStatus: "unknown"` and then
 * promotes on a strict `>` against `STATUS_RANK`. Until S119, `unknown` and
 * `operational` were BOTH rank 0, so an operational sample could never beat the
 * initialiser: a healthy day had no way to say so. Every day in production sat
 * at `unknown` and only looked green because `dayTone` had a trailing
 * `hasSamples ? "op"` fallback painting it. The census is what made that
 * visible — `operational` appeared ZERO times across every tool and every day
 * while buckets carried 254-803 samples each.
 *
 * That is not something a unit test would have caught, because the unit tests
 * asserted the buckets, and the buckets were self-consistently wrong. It needed
 * a count taken against the live payload. Hence a script rather than a test.
 *
 * WHAT TO EXPECT AFTER THE S119 RANK FIX DEPLOYS
 *
 * Read this before concluding anything from the dashboard:
 *
 *   - The CENSUS is the verification, NOT the visual. Buckets moving
 *     `unknown -> operational` were ALREADY being drawn green by the
 *     `hasSamples ? "op"` fallback, so the strip can look pixel-identical
 *     before and after. "The strip looks the same" does NOT mean the fix
 *     failed. `operational > 0` in the census means it landed.
 *   - The only possible VISUAL delta is a day whose every sample was literally
 *     unreadable turning grey/"not measured". There may be zero such days.
 *
 * USAGE
 *
 *   node scripts/ops/status-bucket-census.mjs
 *   node scripts/ops/status-bucket-census.mjs --url https://gawk.dev
 *   node scripts/ops/status-bucket-census.mjs --wait --after 2026-09-10T14:00:00Z
 *
 * `--wait` polls until `operational` is non-zero (and, with `--after`, until
 * `polledAt` is later than that timestamp, so you are reading the NEW deploy
 * rather than a cached response from the old one). Exits non-zero on timeout.
 *
 * NOTE ON PREVIEW DEPLOYMENTS: preview URLs are SSO-gated and answer
 * `302 -> vercel.com/sso-api`, so this cannot be run against a PR preview
 * without a `VERCEL_AUTOMATION_BYPASS_SECRET`. Run it against production after
 * the merge, or against `aipulse-pi.vercel.app`, which is open.
 */

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};

const BASE = flag("url", "https://aipulse-pi.vercel.app");
const WAIT = args.includes("--wait");
const AFTER = flag("after", null);
const TIMEOUT_MS = Number(flag("timeout", 900)) * 1000;
const INTERVAL_MS = 30_000;

// Mirrors MAX_SAMPLES in src/lib/data/status-history.ts.
const MAX_SAMPLES = 2100;

const RANKED = ["unknown", "operational", "degraded", "partial_outage", "major_outage"];

async function census() {
  const res = await fetch(`${BASE}/api/v1/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${BASE}/api/v1/status -> HTTP ${res.status}`);
  const body = await res.json();
  const tools = body.data ?? {};

  const counts = new Map();
  const sampleOnly = [];
  for (const [tool, payload] of Object.entries(tools)) {
    for (const b of payload.history ?? []) {
      const key = `${b.worstStatus}/${b.sampleCount > 0 ? "samples" : "no-samples"}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      // A promoted bucket with NO incidents could only have been promoted by a
      // sample. These are the only direct evidence that the sample path does
      // anything at all — see the PR #132 discussion.
      if (b.worstStatus !== "unknown" && b.sampleCount > 0 && (b.incidents ?? []).length === 0) {
        sampleOnly.push({ tool, date: b.date, status: b.worstStatus, n: b.sampleCount });
      }
    }
  }

  const operational = [...counts.entries()]
    .filter(([k]) => k.startsWith("operational/"))
    .reduce((sum, [, v]) => sum + v, 0);

  return { polledAt: body.polledAt, failures: body.failures ?? [], counts, sampleOnly, operational, tools };
}

function report({ polledAt, failures, counts, sampleOnly, operational, tools }) {
  console.log(`\n${BASE}/api/v1/status`);
  console.log(`polledAt: ${polledAt}   failures: ${failures.length ? failures.join(", ") : "none"}\n`);

  console.log("bucket census (worstStatus / has samples):");
  const keys = [...counts.keys()].sort(
    (a, b) => RANKED.indexOf(a.split("/")[0]) - RANKED.indexOf(b.split("/")[0]) || a.localeCompare(b),
  );
  for (const k of keys) console.log(`  ${k.padEnd(28)} ${String(counts.get(k)).padStart(3)}`);

  console.log(`\noperational buckets: ${operational}`);
  if (operational === 0) {
    console.log("  ^ ZERO. A healthy day cannot say so. This is the S119 symptom —");
    console.log("    either the rank fix has not deployed, or it did not work.");
  }

  // A saturated list means the oldest days were EVICTED, not never polled — so
  // a `no-samples` bucket cannot be read as "nobody looked". Production hit this
  // exactly: counts summing to MAX_SAMPLES with the two oldest buckets at zero.
  const perTool = Object.values(tools).map((t) => (t.history ?? []).reduce((a, b) => a + b.sampleCount, 0));
  const saturated = perTool.filter((n) => n >= MAX_SAMPLES);
  if (saturated.length) {
    console.log(
      `\nWARNING: ${saturated.length}/${perTool.length} tools have samples summing to >= MAX_SAMPLES ` +
        `(${MAX_SAMPLES}). The list is saturated, so "unknown/no-samples" buckets are days that were ` +
        `TRIMMED, not days nobody polled. Retention is shorter than the window claims — see PR #133.`,
    );
  }

  console.log(`\nsample-only promotions (promoted with NO incident): ${sampleOnly.length}`);
  if (sampleOnly.length === 0) {
    console.log("  ^ none. Every promoted bucket is explained by the incident path, so this");
    console.log("    payload shows NO observable effect from the sample path either way.");
  }
  for (const s of sampleOnly) {
    console.log(`  ${s.tool.padEnd(12)} ${s.date}  ${s.status.padEnd(15)} n=${s.n}`);
  }

  console.log("\nper-tool:");
  for (const [n, t] of Object.entries(tools)) {
    const h = t.history ?? [];
    console.log(
      `  ${n.padEnd(12)} status=${String(t.status).padEnd(14)} ` +
        `worst=[${h.map((b) => b.worstStatus.slice(0, 4)).join(" ")}] ` +
        `n=[${h.map((b) => b.sampleCount).join(" ")}]`,
    );
  }
  console.log();
}

const deadline = Date.now() + TIMEOUT_MS;
for (;;) {
  const result = await census();
  const fresh = !AFTER || Date.parse(result.polledAt) > Date.parse(AFTER);
  const done = result.operational > 0 && fresh;

  if (!WAIT || done) {
    report(result);
    if (WAIT && done) console.log("PASS — operational buckets are non-zero on a fresh poll.\n");
    process.exit(WAIT && !done ? 1 : 0);
  }

  const why = !fresh ? `polledAt ${result.polledAt} not after ${AFTER}` : "operational still 0";
  if (Date.now() > deadline) {
    report(result);
    console.error(`TIMEOUT — ${why}\n`);
    process.exit(1);
  }
  console.log(`waiting (${why})…`);
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
