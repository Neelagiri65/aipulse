/**
 * POST /api/push/apns — the iOS app registers its APNs device token.
 * DELETE /api/push/apns — the app unregisters (opt-out).
 *
 * Body: { token: lowercase hex (Apple says the length may change; a 2026
 *         simulator gives 160 chars, devices 64), env: "sandbox" | "production", tools?: ToolId[] }
 *
 * `env` is mandatory and strict: a debug build's token only works against
 * the sandbox gateway and an App Store build's only against production; a
 * token sent to the wrong one is BadDeviceToken and gets deleted. The app
 * knows which build it is; the server never guesses.
 *
 * Public like /api/push/subscribe: a token is only ever useful to Apple, and
 * the app collects it only after the user opts in (constraint test 8).
 */
import { NextResponse } from "next/server";
import { isApnsEnv, isApnsToken, removeApnsToken, saveApnsToken } from "@/lib/push/apns-store";
import { parseStack } from "@/lib/stack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { token?: unknown; env?: unknown; tools?: unknown };

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
  if (!isApnsToken(body.token)) {
    return NextResponse.json({ ok: false, error: "invalid_token", expected: "lowercase hex, even length, 32-256 characters" }, { status: 400 });
  }
  if (!isApnsEnv(body.env)) {
    return NextResponse.json({ ok: false, error: "invalid_env", expected: ["sandbox", "production"] }, { status: 400 });
  }
  let tools = null;
  if (body.tools !== undefined && body.tools !== null) {
    if (!Array.isArray(body.tools)) {
      return NextResponse.json({ ok: false, error: "invalid_tools" }, { status: 400 });
    }
    tools = parseStack(JSON.stringify(body.tools));
  }
  const result = await saveApnsToken(body.token, body.env, tools);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 503 });
  return NextResponse.json({ ok: true, env: body.env, tools }, { status: 200 });
}

export async function DELETE(request: Request) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  if (!isApnsToken(body.token) || !isApnsEnv(body.env)) {
    return NextResponse.json({ ok: false, error: "invalid_token_or_env" }, { status: 400 });
  }
  const result = await removeApnsToken(body.token, body.env);
  return NextResponse.json({ ok: result.ok }, { status: result.ok ? 200 : 503 });
}
