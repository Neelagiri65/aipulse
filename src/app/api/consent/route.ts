/**
 * /api/consent — GET (read current state) + POST (grant/revoke/update).
 *
 * Contract:
 *
 *   GET: returns {visitorId, categories, gpc, covered}. Mints a
 *        visitor id on first request (sets aip_visitor cookie). The
 *        `gpc` flag echoes whether the browser sent Sec-GPC:1 so the
 *        banner can render "honouring your browser's Do Not Track".
 *        If gpc=true, returned categories are forced to (true,false,false)
 *        regardless of what's stored.
 *
 *   POST: body {analytics: boolean, marketing: boolean, action:
 *         "grant"|"revoke"|"update"}. Writes ConsentState + appends
 *         to consent:audit:{YYYY-MM}. Rate-limited 30/hr/visitor.
 *         If Sec-GPC:1, analytics + marketing are coerced to false
 *         on write too (not just on read).
 */

import { NextResponse } from "next/server";
import {
  jsonError,
  withUserRoute,
  type UserRouteContext,
} from "@/app/api/_lib/userRoute";
import { parseGeo } from "@/lib/geo";
import {
  readConsent,
  writeConsent,
  type ConsentAction,
  type ConsentCategories,
  type ConsentClient,
  type ConsentState,
} from "@/lib/data/consent";
import {
  checkAndIncrement,
  type RateLimitClient,
} from "@/lib/data/rate-limit";
import {
  applyGpc,
  isGpcSet,
  mintVisitorId,
  readVisitorId,
  setConsentCookie,
  setVisitorCookie,
} from "@/lib/consent-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 30;
const RATE_WINDOW_SEC = 60 * 60;

export type ConsentDeps = {
  consentClient?: ConsentClient;
  rateLimitClient?: RateLimitClient;
  now?: () => number;
  mintId?: () => string;
};

function defaultCategories(): ConsentCategories {
  return { necessary: true, analytics: false, marketing: false };
}

export async function handleConsentGet(
  ctx: UserRouteContext,
  deps: ConsentDeps = {},
): Promise<NextResponse> {
  const { request, traceId } = ctx;
  const cookieHeader = request.headers.get("cookie");
  const gpc = isGpcSet(request.headers);
  const geo = parseGeo(request.headers);

  let visitorId = readVisitorId(cookieHeader);
  let minted = false;
  if (!visitorId) {
    visitorId = (deps.mintId ?? mintVisitorId)();
    minted = true;
  }

  const stored = await readConsent(visitorId, { client: deps.consentClient });
  const rawCategories = stored?.categories ?? defaultCategories();
  const categories = applyGpc(rawCategories, gpc);

  const resp = NextResponse.json({
    ok: true,
    visitorId,
    categories,
    gpc,
    covered: geo.covered,
    geo: { country: geo.country, region: geo.region },
    traceId,
  });
  resp.headers.set("x-aip-trace", traceId);
  if (minted) setVisitorCookie(resp, visitorId);
  // Mirror the state cookie on every GET so the client-side reader
  // agrees with the server record (cheap write, same 1y TTL).
  setConsentCookie(resp, categories);
  return resp;
}

export async function handleConsentPost(
  ctx: UserRouteContext,
  deps: ConsentDeps = {},
): Promise<NextResponse> {
  const { request, traceId } = ctx;
  const cookieHeader = request.headers.get("cookie");
  const gpc = isGpcSet(request.headers);
  const geo = parseGeo(request.headers);

  let visitorId = readVisitorId(cookieHeader);
  let minted = false;
  if (!visitorId) {
    visitorId = (deps.mintId ?? mintVisitorId)();
    minted = true;
  }

  const rate = await checkAndIncrement(
    `rl:consent:${visitorId}`,
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

  const body = await parseBody(request);
  if (!body.ok) {
    return jsonError(
      { status: 400, code: "BAD_BODY", message: "invalid JSON body" },
      traceId,
    );
  }
  const { analytics, marketing, action } = body.value;
  if (
    typeof analytics !== "boolean" ||
    typeof marketing !== "boolean" ||
    !isValidAction(action)
  ) {
    return jsonError(
      { status: 400, code: "BAD_FIELDS", message: "invalid fields" },
      traceId,
    );
  }

  const requested: ConsentCategories = {
    necessary: true,
    analytics,
    marketing,
  };
  const effective = applyGpc(requested, gpc);

  const next: ConsentState = {
    visitorId,
    categories: effective,
    updatedAt: new Date(deps.now?.() ?? Date.now()).toISOString(),
    geo,
  };
  await writeConsent(next, action, {
    client: deps.consentClient,
    now: new Date(deps.now?.() ?? Date.now()),
  });

  const resp = NextResponse.json({
    ok: true,
    visitorId,
    categories: effective,
    gpc,
    coerced: gpc && (requested.analytics || requested.marketing),
    traceId,
  });
  resp.headers.set("x-aip-trace", traceId);
  if (minted) setVisitorCookie(resp, visitorId);
  setConsentCookie(resp, effective);
  return resp;
}

export const GET = withUserRoute((ctx) => handleConsentGet(ctx));
export const POST = withUserRoute((ctx) => handleConsentPost(ctx));

type ConsentBody = {
  analytics?: unknown;
  marketing?: unknown;
  action?: unknown;
};

async function parseBody(
  request: Request,
): Promise<{ ok: true; value: ConsentBody } | { ok: false }> {
  try {
    const value = (await request.json()) as ConsentBody;
    if (!value || typeof value !== "object") return { ok: false };
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function isValidAction(value: unknown): value is ConsentAction {
  return value === "grant" || value === "revoke" || value === "update";
}
