/**
 * POST /api/push/apns/live-activity — the iOS app registers its ActivityKit push-to-start token.
 * DELETE /api/push/apns/live-activity — alerts turned off: forget it.
 *
 * Body: { startToken: lowercase hex, env: "sandbox" | "production", tools?: ToolId[] }
 *
 * gawk.dev uses the token to START the tool-outage Live Activity when a tool in `tools` (or any
 * tool, when no stack is sent) first reports non-operational. Validation mirrors /api/push/apns.
 * The app sends this only after the reader turned alerts on (constraint test 8).
 */
import { NextResponse } from "next/server";
import { isApnsEnv, isApnsToken } from "@/lib/push/apns-store";
import { removeStartToken, saveStartToken } from "@/lib/push/live-activity";
import { parseStack } from "@/lib/stack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { startToken?: unknown; env?: unknown; tools?: unknown };

async function readBody(request: Request): Promise<Body | null> {
  try {
    const b = (await request.json()) as unknown;
    return b && typeof b === "object" ? (b as Body) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  if (!isApnsToken(body.startToken)) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  if (!isApnsEnv(body.env)) return NextResponse.json({ ok: false, error: "invalid_env", expected: ["sandbox", "production"] }, { status: 400 });
  let tools = null;
  if (body.tools !== undefined && body.tools !== null) {
    if (!Array.isArray(body.tools)) return NextResponse.json({ ok: false, error: "invalid_tools" }, { status: 400 });
    tools = parseStack(JSON.stringify(body.tools));
  }
  const r = await saveStartToken(body.startToken, body.env, tools);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true, env: body.env, tools }, { status: 200 });
}

export async function DELETE(request: Request) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  if (!isApnsToken(body.startToken) || !isApnsEnv(body.env)) {
    return NextResponse.json({ ok: false, error: "invalid_token_or_env" }, { status: 400 });
  }
  const r = await removeStartToken(body.startToken, body.env);
  return NextResponse.json({ ok: r.ok }, { status: r.ok ? 200 : 503 });
}
