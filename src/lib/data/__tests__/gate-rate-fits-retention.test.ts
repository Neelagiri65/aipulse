/**
 * The gate TTL and the list cap are one decision, not two.
 *
 * `SAMPLE_GATE_TTL_SECONDS` is not a debounce — it IS the sample rate. The gate
 * is re-claimed by ordinary traffic the moment it expires (requests arrive every
 * ~108s), so the ceiling is `86400 / TTL` rounds per day. If seven days of that
 * exceeds `MAX_SAMPLES`, `ltrim` evicts the oldest day and the "7-day" strip
 * quietly stops holding seven days — the exact bug this pair of constants was
 * chosen to fix.
 *
 * It is an easy one to reopen: the first version of the gate shipped at 240s,
 * which looks conservative next to a 5-minute cron but allows 360 rounds/day and
 * `7 x 360 = 2520 > 2100`. That would have moved the eviction from day 4 to day
 * 6 while appearing to fix it. Nothing in the type system connects the two
 * numbers, so this test does.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_SAMPLES,
  SAMPLE_GATE_TTL_SECONDS,
} from "@/lib/data/status-history";

const SECONDS_PER_DAY = 86_400;
const WINDOW_DAYS = 7;

describe("gate rate fits the retention window", () => {
  it("seven days at the gate's ceiling stays inside MAX_SAMPLES", () => {
    const roundsPerDay = Math.ceil(SECONDS_PER_DAY / SAMPLE_GATE_TTL_SECONDS);
    const roundsPerWindow = roundsPerDay * WINDOW_DAYS;

    expect(roundsPerWindow).toBeLessThanOrEqual(MAX_SAMPLES);
  });

  it("expires before the heartbeat's next tick, so the cron keeps its slot", () => {
    // .github/workflows/heartbeat.yml loops on a literal `sleep 300`; measured
    // spacing over a 175-minute run was 300.3s. A gate at or above that would
    // still be held when the cron arrives, halving the rate and handing
    // sampling to whatever traffic happened to be passing.
    const HEARTBEAT_TICK_SECONDS = 300;

    expect(SAMPLE_GATE_TTL_SECONDS).toBeLessThan(HEARTBEAT_TICK_SECONDS);
  });
});
