/**
 * CLI usage report — reads the passive telemetry counters written by
 * src/lib/telemetry/cli-usage.ts. Aggregates only: daily unique clients
 * (HyperLogLog PFCOUNT — raw IPs were never stored) + command mix.
 *
 * Usage: npx tsx scripts/ops/cli-usage.ts [--days 7]
 * Env:   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (.env.local)
 */

import { Redis } from "@upstash/redis";

const COMMANDS = ["wire", "models", "sdk", "tools"];

async function main() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error("Set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (populate .env.local from Keychain)");
    process.exit(2);
  }
  const r = new Redis({ url, token });

  const daysFlag = process.argv.indexOf("--days");
  const days = daysFlag !== -1 ? Math.max(1, Number(process.argv[daysFlag + 1]) || 7) : 7;

  console.log(`gawk-cli usage — last ${days} day(s), aggregates only\n`);
  console.log("date        uniques  " + COMMANDS.map((c) => c.padStart(7)).join(""));

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const uniques = (await r.pfcount(`cli:dau:${d}`)) ?? 0;
    const mix: number[] = [];
    for (const c of COMMANDS) {
      const v = await r.get<number>(`cli:reqs:${c}:${d}`);
      mix.push(v ?? 0);
    }
    console.log(`${d}  ${String(uniques).padStart(7)}  ${mix.map((v) => String(v).padStart(7)).join("")}`);
  }
  console.log("\nuniques = HyperLogLog estimate of distinct clients (date-salted hashes; IPs never stored)");
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
