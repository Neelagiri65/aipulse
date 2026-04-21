/**
 * POST /api/consent/delete — delete the visitor's consent record + write
 * a tombstone in the audit log. GDPR Art. 17 "right to erasure" surface.
 *
 * Implementation:
 *   - Read visitorId from cookie. If missing, 400 NO_VISITOR (nothing
 *     to delete — don't mint a fresh id just to delete it).
 *   - Rate-limit 10/hr/visitor (delete should be rare; cap abuse).
 *   - deleteConsent writes the tombstone entry; clears the record.
 *   - Clear the aip_consent cookie on the response. We deliberately
 *     keep aip_visitor so future requests still attribute to the same
 *     (anonymous) id — this matches the PRD's "retain visitorId for
 *     legal audit trail but carry no profile" semantics.
 */

import { NextResponse } from "next/server";
import {
  jsonError,
  withUserRoute,
  type UserRouteContext,
} from "@/app/api/_lib/userRoute";
import { parseGeo } from "@/lib/geo";
import {
  deleteConsent,
  type ConsentClient,
} from "@/lib/data/consent";
import {
  checkAndIncrement,
  type RateLimitClient,
} from "@/lib/data/rate-limit";
import {
  clearConsentCookie,
  readVisitorId,
} from "@/lib/consent-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 10;
const RATE_WINDOW_SEC = 60 * 60;

export type ConsentDeleteDeps = {
  consentClient?: ConsentClient;
  rateLimitClient?: RateLimitClient;
  now?: () => number;
};

export async function handleConsentDelete(
  ctx: UserRouteContext,
  deps: ConsentDeleteDeps = {},
): Promise<NextResponse> {
  const { request, traceId } = ctx;
  const cookieHeader = request.headers.get("cookie");
  const visitorId = readVisitorId(cookieHeader);

  if (!visitorId) {
    return jsonError(
      { status: 400, code: "NO_VISITOR", message: "no consent record to delete" },
      traceId,
    );
  }

  const rate = await checkAndIncrement(
    `rl:consent-delete:${visitorId}`,
    RATE_LIMIT_PER_HOUR,
    RATE_WINDOW_SEC,
    { client: deps.rateLimitClient, now: deps.now },
  );
  if (!rate.allowed) {
    return jsonError(
      { status: 429, code: "RATE_LIMITED", message: "too many requests" },
      traceId,
    );
  }

  const geo = parseGeo(request.headers);
  await deleteConsent(visitorId, geo, {
    client: deps.consentClient,
    now: new Date(deps.now?.() ?? Date.now()),
  });

  const resp = NextResponse.json({ ok: true, visitorId, traceId });
  resp.headers.set("x-aip-trace", traceId);
  clearConsentCookie(resp);
  return resp;
}

export const POST = withUserRoute((ctx) => handleConsentDelete(ctx));
