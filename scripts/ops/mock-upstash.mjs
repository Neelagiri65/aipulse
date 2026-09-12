#!/usr/bin/env node
/**
 * A stand-in for the Upstash Redis REST API, for render-mode proofs.
 *
 * Why it exists: this repo's ISR routes read Redis, and @upstash/redis speaks
 * plain HTTP — so whether a route renders statically, dynamically, or throws
 * "Page changed from static to dynamic at runtime" is decided by a fetch that a
 * dev machine without UPSTASH_* never makes. Dummy credentials (ci.yml) make
 * the fetch happen at BUILD time; this server makes it SUCCEED at RUN time, so
 * `next start` can exercise the on-demand render of /digest/<date> exactly as
 * production does. It caught nothing less than a 500 on every archived issue
 * (PR #135 → #140).
 *
 * Protocol: POST / with a JSON command array, or POST /pipeline with an array
 * of them; reply {result} per command. SCAN returns the digest keys, GET returns
 * a stringified DigestBody (the client deserialises), everything else → null.
 *
 *   PORT=7777 node scripts/ops/mock-upstash.mjs &
 *   UPSTASH_REDIS_REST_URL=http://127.0.0.1:7777 UPSTASH_REDIS_REST_TOKEN=x npx next start
 */
import http from "node:http";

export const DATES = ["2026-09-11", "2026-09-10", "2026-09-09"];

function body(date) {
  return JSON.stringify({
    date,
    subject: `gawk.dev — ${date} · render-mode fixture`,
    mode: "quiet",
    greetingTemplate: "Good morning from gawk.dev — all quiet in {geoCountry}.",
    generatedAt: `${date}T08:00:00.000Z`,
    sections: [
      {
        id: "tool-health",
        title: "Tool Health",
        anchorSlug: "tool-health",
        mode: "quiet",
        headline: "All tools operational",
        items: [],
        sourceUrls: [],
      },
    ],
  });
}

const store = new Map(DATES.map((d) => [`digest:${d}`, body(d)]));

function run(cmd) {
  const [op, ...args] = (Array.isArray(cmd) ? cmd : []).map(String);
  switch ((op ?? "").toUpperCase()) {
    case "SCAN":
      return ["0", [...store.keys()]];
    case "GET":
      return store.get(args[0]) ?? null;
    case "PING":
      return "PONG";
    default:
      return null;
  }
}

export function startMockUpstash(port = Number(process.env.PORT ?? 7777)) {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let out;
      try {
        const j = JSON.parse(raw || "[]");
        out = req.url?.startsWith("/pipeline") ? j.map((c) => ({ result: run(c) })) : { result: run(j) };
      } catch (e) {
        out = { error: String(e) };
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(out));
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const port = Number(process.env.PORT ?? 7777);
  await startMockUpstash(port);
  console.log(`mock upstash on http://127.0.0.1:${port} — digest keys: ${DATES.join(", ")}`);
}
