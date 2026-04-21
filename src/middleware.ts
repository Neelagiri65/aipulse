/**
 * middleware — single job for session 33: stamp the sticky `aip_beta`
 * cookie when a visitor lands with `?beta=1`. Keeps the beta gate
 * honoured across subsequent page loads without requiring the query
 * param to stay in the URL.
 *
 * Scope-limited matcher (see `config.matcher` below): runs only on the
 * page paths we care about. Explicitly excludes /api/* because the
 * beta cookie is a UI gate, not an API gate — API auth lives in
 * withIngest / withUserRoute.
 */

import { NextResponse, type NextRequest } from "next/server";
import { BETA_COOKIE_NAME, BETA_COOKIE_MAX_AGE_SEC } from "@/lib/beta";

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  if (request.nextUrl.searchParams.get("beta") === "1") {
    response.cookies.set(BETA_COOKIE_NAME, "1", {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: BETA_COOKIE_MAX_AGE_SEC,
    });
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all page paths EXCEPT:
     * - /api/* (server endpoints, not a UI gate)
     * - /_next/static, /_next/image (framework assets)
     * - Favicons, manifests, robots, sitemap (static public assets)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|data-sources.md|robots.txt|sitemap.xml).*)",
  ],
};
