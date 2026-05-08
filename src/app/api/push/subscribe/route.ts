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

  const sub = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
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

  const result = await savePushSubscription(sub as any);
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
