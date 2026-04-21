/**
 * withIngest — shared wrapper for cron-driven write-side endpoints.
 *
 * Every ingest route needs the same three slabs of boilerplate:
 *   1. Reject if INGEST_SECRET is unset (503) or doesn't match the
 *      x-ingest-secret header (401). No exceptions — this is the only
 *      thing standing between an attacker and our Redis writes.
 *   2. Run the route-specific work, catching thrown errors so the cron
 *      health record gets written before the error propagates.
 *   3. Write a cron health record on success OR failure (both branches),
 *      since a cron that throws silently is the worst failure mode.
 *
 * This wrapper bakes in (1) and (3) and asks the route for:
 *   - the workflow identifier (matches CRON_WORKFLOWS)
 *   - the unit of work (a function taking Request, returning a result)
 *   - how to translate that result into a CronHealthOutcome
 *   - how to translate that result into the HTTP response shape
 *
 * Route-level config (runtime, dynamic, maxDuration) stays in the route
 * file — those are static exports Next.js reads at build time and can't
 * be returned from a helper.
 *
 * This is a narrow helper, not a generic source adapter: it does NOT
 * know how to fetch, filter, geocode, or store. Each ingest pipeline
 * stays in its own module. The wrapper only collapses the boilerplate
 * that is literally identical across every route.
 */

import { NextResponse } from "next/server";
import {
  writeCronHealth,
  type CronHealthOutcome,
  type CronWorkflowName,
} from "@/lib/data/cron-health";

export type WithIngestConfig<TResult> = {
  /** Workflow key — must exist in CRON_WORKFLOWS. */
  workflow: CronWorkflowName;
  /** Route-specific work. Reads the Request, runs the ingest, returns
   *  whatever shape the pipeline already returns. Errors thrown here
   *  are caught, recorded as cron health failures, and rethrown. */
  run: (request: Request) => Promise<TResult>;
  /** Translate the result into a CronHealthOutcome. Lets each route
   *  decide what "ok" means (e.g. ok:true iff at least one item written,
   *  or iff no sub-step failed, or always true as long as no throw). */
  toOutcome: (result: TResult) => CronHealthOutcome;
  /** Translate the result into the HTTP response. Default is
   *  `{ ok: true, result }` to match the existing API contract of most
   *  registry routes. Routes with a different shape (e.g. /api/ingest
   *  returning `{ ok, meta, writtenCount }`) override this. */
  toResponse?: (result: TResult) => NextResponse;
};

export function withIngest<TResult>(
  config: WithIngestConfig<TResult>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const requiredSecret = process.env.INGEST_SECRET;
    if (!requiredSecret) {
      return NextResponse.json(
        { ok: false, error: "INGEST_SECRET not configured on server" },
        { status: 503 },
      );
    }
    const provided = request.headers.get("x-ingest-secret");
    if (provided !== requiredSecret) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }

    let result: TResult;
    try {
      result = await config.run(request);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await writeCronHealth(config.workflow, { ok: false, error: msg });
      throw e;
    }

    await writeCronHealth(config.workflow, config.toOutcome(result));

    if (config.toResponse) return config.toResponse(result);
    return NextResponse.json({ ok: true, result });
  };
}
