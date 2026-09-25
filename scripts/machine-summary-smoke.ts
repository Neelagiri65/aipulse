/**
 * Smoke test for machine summaries against real pages and the real model. Manual, not in CI.
 *
 *   NVIDIA_NIM_KEY=$(security find-generic-password -s nvidia-nim-key -w) npx tsx scripts/machine-summary-smoke.ts
 *
 * Takes today's Hacker News front-page LINK posts (Algolia, no key), runs the exact production
 * path (summariseArticle) on up to 8, and prints each outcome — so the grounding check's drop
 * rate on real answers is measured, not assumed. Writes nothing anywhere.
 */
import { summariseArticle } from "../src/lib/summaries/machine-summary";

async function main() {
  const apiKey = process.env.NVIDIA_NIM_KEY?.trim();
  if (!apiKey) throw new Error("NVIDIA_NIM_KEY is not set");
  const res = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30");
  const hits = ((await res.json()) as { hits: Array<{ title: string; url: string | null }> }).hits;
  const links = hits.filter((h) => h.url && !/\.(pdf|mp4)$/i.test(h.url)).slice(0, 8);
  const tally: Record<string, number> = {};
  for (const h of links) {
    const out = await summariseArticle({ url: h.url!, title: h.title, apiKey });
    const key = out.ok ? "ok" : out.reason;
    tally[key] = (tally[key] ?? 0) + 1;
    console.log(`\n[${key}] ${h.title}\n  ${h.url}${out.ok ? `\n  → ${out.summary.text}` : ""}`);
  }
  console.log("\nTally:", JSON.stringify(tally));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
