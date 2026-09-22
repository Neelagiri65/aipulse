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
 * HSCAN/HLEN/HGET serve a seeded registry hash, so the paged registry endpoints
 * (/api/v1/sources, /api/registry) can be exercised for real: cursor paging,
 * `?repo=` detail, and the fact that ONE page is ONE command. The seed includes
 * a sample cut mid-emoji, which is what made the old 38MB response unparseable
 * by `jq`.
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

/* ---- Registry hash ------------------------------------------------------ */

const REGISTRY_KEY = "aipulse:registry:entries";

/** `sample` on the third entry ends in a lone high surrogate, as production's did. */
function registryEntry(i) {
  const fullName = `owner${i}/repo${i}`;
  return JSON.stringify({
    fullName,
    owner: `owner${i}`,
    name: `repo${i}`,
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastActivity: "2026-09-01T00:00:00.000Z",
    stars: 100 + i,
    // Every third entry is located, so /api/registry/points has dots to serve;
    // two are malformed (lat only; string lat) to prove the point filter.
    location:
      i === 6
        ? { lat: 51.5 }
        : i === 9
          ? { lat: "51.5", lng: -0.1, label: "London, UK" }
          : i % 3 === 0
            ? { lat: 48.85 + i / 1000, lng: 2.35, label: `City ${i}` }
            : undefined,
    configs: [
      {
        kind: "claude-md",
        path: "CLAUDE.md",
        sample: i === 3 ? "cut mid-emoji \uD83D" : `# CLAUDE.md for repo${i}`,
        score: 1,
        verifiedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
}

/** 250 entries: more than one default page (100), so paging is real. */
const registry = new Map(
  Array.from({ length: 250 }, (_, n) => [`owner${n}/repo${n}`, registryEntry(n)]),
);

/** HSCAN over an insertion-ordered Map: the cursor is the next index. */
function hscan(cursor, count) {
  const fields = [...registry.entries()];
  const start = Number(cursor) || 0;
  const end = Math.min(start + (count || 10), fields.length);
  const flat = fields.slice(start, end).flat();
  return [end >= fields.length ? "0" : String(end), flat];
}

function run(cmd) {
  const [op, ...args] = (Array.isArray(cmd) ? cmd : []).map(String);
  switch ((op ?? "").toUpperCase()) {
    case "SCAN":
      return ["0", [...store.keys()]];
    case "GET":
      return store.get(args[0]) ?? null;
    case "HSCAN": {
      // [key, cursor, "COUNT", n]
      if (args[0] !== REGISTRY_KEY) return ["0", []];
      const countAt = args.findIndex((a) => a.toUpperCase() === "COUNT");
      return hscan(args[1], countAt === -1 ? 10 : Number(args[countAt + 1]));
    }
    case "HLEN":
      return args[0] === REGISTRY_KEY ? registry.size : 0;
    case "HGET":
      return args[0] === REGISTRY_KEY ? (registry.get(args[1]) ?? null) : null;
    case "PING":
      return "PONG";
    default:
      return null;
  }
}

/**
 * @upstash/redis sends `Upstash-Encoding: base64` and base64-DECODES whatever
 * comes back. A mock that replies in plain text therefore hands the client
 * mojibake — which showed up as an HSCAN cursor of "\ufffdM" instead of "100",
 * i.e. the mock breaking paging that works fine against real Upstash. Encode
 * when the client asks for it, so a local proof means something.
 */
function encodeResult(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8").toString("base64");
  if (Array.isArray(value)) return value.map(encodeResult);
  return value;
}

export function startMockUpstash(port = Number(process.env.PORT ?? 7777)) {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let out;
      const b64 = String(req.headers["upstash-encoding"] ?? "").toLowerCase() === "base64";
      const encode = (v) => (b64 ? encodeResult(v) : v);
      try {
        const j = JSON.parse(raw || "[]");
        out = req.url?.startsWith("/pipeline")
          ? j.map((c) => ({ result: encode(run(c)) }))
          : { result: encode(run(j)) };
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
  console.log(`mock upstash on http://127.0.0.1:${port} — digest keys: ${DATES.join(", ")}; registry entries: ${registry.size}`);
}
