/**
 * Admin basic-auth gate for `/admin/digest/preview` + `/api/digest/preview`.
 *
 * Solo-founder scope: one operator account via env (`ADMIN_PREVIEW_USER`,
 * `ADMIN_PREVIEW_PASS`). Basic Auth is defensible for an admin-only
 * preview route behind HTTPS; it's not a replacement for SSO if the
 * product ever grows a team.
 *
 * Constant-time compare via `crypto.timingSafeEqual` so the 401 path
 * does not leak whether it was the username or the password that didn't
 * match. Input-length-equalised before compare (Buffers of different
 * length would throw in timingSafeEqual).
 */

import { timingSafeEqual } from "node:crypto";

export type AdminCreds = { user: string; pass: string };

/** Parse `Authorization: Basic ...` into {user, pass}. Returns null when
 *  the header is missing or malformed (not a valid base64, no colon). */
export function parseBasicAuth(header: string | null | undefined): AdminCreds | null {
  if (!header) return null;
  const m = /^Basic\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const idx = decoded.indexOf(":");
  if (idx < 0) return null;
  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

/** Constant-time compare of two strings via timingSafeEqual on equal-
 *  length buffers. Returns false on length mismatch without leaking the
 *  mismatch position. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyAdminBasicAuth(
  header: string | null | undefined,
  expected: AdminCreds,
): boolean {
  const parsed = parseBasicAuth(header);
  if (!parsed) return false;
  const userOk = constantTimeEqual(parsed.user, expected.user);
  const passOk = constantTimeEqual(parsed.pass, expected.pass);
  // Always compute both comparisons so the return timing doesn't depend
  // on which side mismatched.
  return userOk && passOk;
}

export type RequireAdminOpts = {
  /** When the required env vars aren't set, block access by default.
   *  Flipping this to true would turn the gate into a no-op — don't. */
  allowUnconfigured?: boolean;
  /** Override env-read for tests. */
  creds?: AdminCreds;
};

/** Returns a 401 Response when auth fails, or null when it passes. Use
 *  `if (resp) return resp;` in a route handler. */
export function requireAdminBasicAuth(
  header: string | null | undefined,
  opts: RequireAdminOpts = {},
): Response | null {
  const creds = opts.creds ?? loadCreds();
  if (!creds) {
    if (opts.allowUnconfigured) return null;
    return unauthorized("admin preview is not configured on this deploy");
  }
  if (!verifyAdminBasicAuth(header, creds)) {
    return unauthorized();
  }
  return null;
}

function loadCreds(): AdminCreds | null {
  const user = process.env.ADMIN_PREVIEW_USER;
  const pass = process.env.ADMIN_PREVIEW_PASS;
  if (!user || !pass) return null;
  return { user, pass };
}

function unauthorized(reason?: string): Response {
  return new Response(reason ?? "Unauthorized", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="AI Pulse admin"',
      "cache-control": "no-store",
    },
  });
}
