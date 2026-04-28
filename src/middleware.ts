/**
 * middleware — two jobs:
 *   1. Stamp the sticky `aip_beta` cookie when a visitor lands with
 *      `?beta=1`, so the beta gate persists across subsequent page
 *      loads without the query param sticking around.
 *   2. Gate `/admin/*` with HTTP Basic Auth. Middleware is where we
 *      can actually return a 401 with `WWW-Authenticate`, which pages
 *      can't emit directly in the App Router.
 *
 * Scope-limited matcher (see `config.matcher` below): runs only on the
 * page paths we care about. Explicitly excludes /api/* because both
 * gates are UI-layer — API auth lives in withIngest / withUserRoute.
 */

import { NextResponse, type NextRequest } from "next/server";
import { BETA_COOKIE_NAME, BETA_COOKIE_MAX_AGE_SEC } from "@/lib/beta";
import { verifyAdminBasicAuth } from "@/lib/digest/admin-auth";

export function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const auth = request.headers.get("authorization");
    const user = process.env.ADMIN_PREVIEW_USER;
    const pass = process.env.ADMIN_PREVIEW_PASS;
    if (!user || !pass) {
      return new NextResponse("admin not configured on this deploy", {
        status: 401,
        headers: {
          "www-authenticate": 'Basic realm="Gawk admin"',
          "cache-control": "no-store",
        },
      });
    }
    if (!verifyAdminBasicAuth(auth, { user, pass })) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: {
          "www-authenticate": 'Basic realm="Gawk admin"',
          "cache-control": "no-store",
        },
      });
    }
  }

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
