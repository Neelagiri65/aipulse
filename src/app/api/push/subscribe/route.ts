/**
 * POST /api/push/subscribe — register a browser push subscription.
 * DELETE /api/push/subscribe — unregister a push subscription.
 *
 * No auth required. The subscription object itself is the identifier.
 * Rate-limited by the global middleware at the Vercel layer.
 */

import { NextResponse } from "next/server";
import {
  savePushSubscription,
  removePushSubscription,
} from "@/lib/push/store";
import { parseStack } from "@/lib/stack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const sub = body as {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: { p256dh?: string; auth?: string };
    tools?: unknown;
  };
  if (
    !sub.endpoint ||
    !sub.keys?.p256dh ||
    !sub.keys?.auth
  ) {
    return NextResponse.json(
      { ok: false, error: "missing_fields", required: ["endpoint", "keys.p256dh", "keys.auth"] },
      { status: 400 },
    );
  }

  // Optional `tools`: the visitor's stack, so alerts can be sent for those
  // tools only (src/lib/stack.ts constraint 2, amended). Absent or empty
  // means every alert; unknown ids are dropped; anything but an array is
  // a client bug and is refused rather than silently widened.
  if (sub.tools !== undefined && !Array.isArray(sub.tools)) {
    return NextResponse.json({ ok: false, error: "invalid_tools" }, { status: 400 });
  }
  const tools = Array.isArray(sub.tools) ? parseStack(JSON.stringify(sub.tools)) : null;

  const result = await savePushSubscription(
    { endpoint: sub.endpoint, expirationTime: sub.expirationTime, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
    tools,
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, id: result.id });
}

export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const { endpoint } = body as { endpoint?: string };
  if (!endpoint) {
    return NextResponse.json(
      { ok: false, error: "missing_endpoint" },
      { status: 400 },
    );
  }

  const result = await removePushSubscription(endpoint);
  return NextResponse.json({ ok: result.ok });
}
