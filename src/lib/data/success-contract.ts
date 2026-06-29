/**
 * The unified cron success contract.
 *
 * A run is a FAILURE only when it ATTEMPTED work and delivered NOTHING.
 * "Nothing to do" — no subscribers, an empty upstream feed, a paused
 * source — is NOT a failure: it is a green run with itemsProcessed:0.
 *
 * This single predicate sits behind every cron's `ok`, so the JSON `ok`
 * a workflow guard parses and the cron-health `lastSuccessAt` beacon can
 * never disagree. Divergent, ad-hoc success criteria per route were the
 * "inconsistent success contract" root cause in the 2026-06-28 systemic
 * reliability audit (digest lied green on a 0-sent run; reddit cried wolf
 * when one subreddit 429'd after others had already written cards).
 *
 *   delivered=0, failures>0  → true   (attempted, total failure)  → ok:false
 *   delivered=0, failures=0  → false  (nothing to do)             → ok:true
 *   delivered>0, failures≥0  → false  (forward progress)          → ok:true
 *
 * `delivered` and `failures` are UNITS OF THE SAME KIND — count delivered
 * recipients against failed chunks, or completed sources against errored
 * sources, but never mix "items written" (throughput) into `delivered`:
 * a quiet poll that writes nothing is still a delivered, non-failed run.
 */
export function isTotalFailure(args: {
  delivered: number;
  failures: number;
}): boolean {
  return args.delivered === 0 && args.failures > 0;
}
