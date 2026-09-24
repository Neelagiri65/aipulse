/**
 * POST /api/push/apns/live-activity/activity — a running tool-outage activity's update token.
 *
 * Body: { activityToken: lowercase hex, toolId: ToolId, env: "sandbox" | "production" }
 *
 * gawk.dev ends the activity with this token when the tool's status page reports operational,
 * then forgets the token (an ended activity's token is spent).
 */
import { NextResponse } from "next/server";
import { isApnsEnv, isApnsToken } from "@/lib/push/apns-store";
import { saveActivityToken } from "@/lib/push/live-activity";
import { parseStack } from "@/lib/stack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { activityToken?: unknown; toolId?: unknown; env?: unknown };

export async function POST(request: Request) {
  let body: Body | null = null;
  try {
    const b = (await request.json()) as unknown;
    body = b && typeof b === "object" ? (b as Body) : null;
  } catch {
    body = null;
  }
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  if (!isApnsToken(body.activityToken)) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  if (!isApnsEnv(body.env)) return NextResponse.json({ ok: false, error: "invalid_env" }, { status: 400 });
  // Only a known tool id: the same parser that validates a stack.
  const known = typeof body.toolId === "string" ? (parseStack(JSON.stringify([body.toolId])) ?? []) : [];
  if (known.length !== 1) return NextResponse.json({ ok: false, error: "invalid_tool" }, { status: 400 });
  const r = await saveActivityToken(body.activityToken, known[0], body.env);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
