/**
 * consent-cookies — helpers for reading + writing the two cookies the
 * consent API manages:
 *
 *   aip_visitor  — server-minted UUIDv4, HttpOnly, 1-year max-age.
 *                  Identifies the visitor in the audit log. Never a
 *                  fingerprint; rotatable by deleting the cookie.
 *   aip_consent  — JSON-encoded ConsentCategories, readable by the
 *                  client so the banner + analytics mount reflect
 *                  current state without a round-trip.
 *
 * Also houses the Sec-GPC honour logic (§5 of the PRD): when the
 * browser sends `Sec-GPC: 1`, the server forces analytics + marketing
 * to false regardless of what the body requested, and the banner is
 * treated as pre-answered.
 */

import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import { hasCookie } from "@/lib/beta";
import type { ConsentCategories } from "@/lib/data/consent";

export const VISITOR_COOKIE = "aip_visitor";
export const CONSENT_COOKIE = "aip_consent";
const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

export function readVisitorId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== VISITOR_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (value.length === 0) return null;
    return decodeURIComponent(value);
  }
  return null;
}

export function readConsentCookie(
  cookieHeader: string | null,
): ConsentCategories | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== CONSENT_COOKIE) continue;
    const raw = part.slice(eq + 1).trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
      if (!parsed || typeof parsed !== "object") return null;
      const o = parsed as Record<string, unknown>;
      if (
        o.necessary !== true ||
        typeof o.analytics !== "boolean" ||
        typeof o.marketing !== "boolean"
      ) {
        return null;
      }
      return {
        necessary: true,
        analytics: o.analytics,
        marketing: o.marketing,
      };
    } catch {
      return null;
    }
  }
  return null;
}

export function mintVisitorId(): string {
  return randomUUID();
}

export function setVisitorCookie(resp: NextResponse, visitorId: string): void {
  resp.cookies.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SEC,
  });
}

export function setConsentCookie(
  resp: NextResponse,
  categories: ConsentCategories,
): void {
  resp.cookies.set(CONSENT_COOKIE, JSON.stringify(categories), {
    httpOnly: false, // readable by the client — that's the point
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SEC,
  });
}

export function clearConsentCookie(resp: NextResponse): void {
  resp.cookies.set(CONSENT_COOKIE, "", {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Global Privacy Control — honour the `Sec-GPC: 1` header from §5 of
 * the PRD. We ship day-1 rather than defer to a follow-up PR. The
 * header is informational: the user's browser is signalling "don't
 * sell/share my data". We treat that as equivalent to refusing
 * analytics + marketing consent.
 */
export function isGpcSet(headers: { get(name: string): string | null }): boolean {
  return headers.get("sec-gpc") === "1";
}

export function applyGpc(
  categories: ConsentCategories,
  gpc: boolean,
): ConsentCategories {
  if (!gpc) return categories;
  return { necessary: true, analytics: false, marketing: false };
}

/**
 * Re-export hasCookie from beta.ts so consent route files can import
 * everything cookie-related from one module. No new logic here.
 */
export { hasCookie };
