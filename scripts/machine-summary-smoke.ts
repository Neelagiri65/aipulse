/**
 * Machine summaries against real pages and real models — picks the model by measurement.
 * Manual, not in CI. Writes nothing.
 *
 *   NVIDIA_NIM_KEY=$(security find-generic-password -s nvidia-nim-key -w) npx tsx scripts/machine-summary-smoke.ts
 *   MODELS="a/b,c/d" ... to compare other models.
 *
 * Takes today's Hacker News front-page LINK posts (Algolia, no key), fetches each article ONCE,
 * then runs the production path (summariseArticle — same prompt, same grounding check) for every
 * candidate model on the same pages, and prints per model: grounded / dropped / errors, median
 * latency, and every summary it wrote, so both faithfulness and readability can be compared.
 */
import { summariseArticle } from "../src/lib/summaries/machine-summary";

const DEFAULT_MODELS = [
  "deepseek-ai/deepseek-v4.1-flash",
  "nvidia/nemotron-3-super-120b-a12b",
  "moonshotai/kimi-k2.6",
  "google/gemma-4-31b-it",
  "mistralai/mistral-large-2-instruct",
];

async function main() {
  const apiKey = process.env.NVIDIA_NIM_KEY?.trim();
  if (!apiKey) throw new Error("NVIDIA_NIM_KEY is not set");
  const models = (process.env.MODELS ?? DEFAULT_MODELS.join(",")).split(",").map((m) => m.trim()).filter(Boolean);
  const res = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40");
  const hits = ((await res.json()) as { hits: Array<{ title: string; url: string | null }> }).hits;
  const links = hits.filter((h) => h.url && !/\.(pdf|mp4)$/i.test(h.url) && !/youtube\.com|twitter\.com|x\.com/.test(h.url)).slice(0, 8);

  // Fetch each page once and replay it to every model, so the comparison is on identical input.
  const pages = new Map<string, string>();
  for (const h of links) {
    try {
      const r = await fetch(h.url!, { headers: { "User-Agent": "gawk.dev-summary/1.0 (+https://gawk.dev/sources)" }, signal: AbortSignal.timeout(10_000) });
      pages.set(h.url!, r.ok ? await r.text() : "");
    } catch {
      pages.set(h.url!, "");
    }
  }
  const replay = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (pages.has(u)) return new Response(pages.get(u)!, { status: pages.get(u) ? 200 : 502 });
    return fetch(url, init);
  }) as typeof fetch;

  const table: string[] = [];
  for (const model of models) {
    const tally: Record<string, number> = {};
    const ms: number[] = [];
    console.log(`\n=== ${model}`);
    for (const h of links) {
      const t0 = Date.now();
      const out = await summariseArticle({ url: h.url!, title: h.title, apiKey, model, fetchImpl: replay });
      ms.push(Date.now() - t0);
      const key = out.ok ? "grounded" : out.reason;
      tally[key] = (tally[key] ?? 0) + 1;
      console.log(`[${key}] ${h.title}${out.ok ? `\n   → ${out.summary.text}` : ""}`);
    }
    ms.sort((a, b) => a - b);
    table.push(`${model.padEnd(40)} ${JSON.stringify(tally)}  median ${ms[Math.floor(ms.length / 2)]} ms`);
  }
  console.log(`\n${links.length} articles, same input for every model:\n${table.join("\n")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
