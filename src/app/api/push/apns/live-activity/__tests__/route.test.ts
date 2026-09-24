import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveStartToken, removeStartToken, saveActivityToken } = vi.hoisted(() => ({
  saveStartToken: vi.fn(async (...args: unknown[]) => args && ({ ok: true as const })),
  removeStartToken: vi.fn(async (...args: unknown[]) => args && ({ ok: true })),
  saveActivityToken: vi.fn(async (...args: unknown[]) => args && ({ ok: true as const })),
}));
vi.mock("@/lib/push/live-activity", () => ({ saveStartToken, removeStartToken, saveActivityToken }));

import { DELETE, POST } from "@/app/api/push/apns/live-activity/route";
import { POST as POST_ACTIVITY } from "@/app/api/push/apns/live-activity/activity/route";

const TOKEN = "ab".repeat(40); // 160 hex — what a 2026 simulator hands over
const req = (body: unknown) => new Request("https://gawk.dev/x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { saveStartToken.mockClear(); removeStartToken.mockClear(); saveActivityToken.mockClear(); });

describe("POST /api/push/apns/live-activity — the push-to-start token", () => {
  it("saves a valid token with env and the parsed stack", async () => {
    const res = await POST(req({ startToken: TOKEN, env: "sandbox", tools: ["openai-api", "not-a-tool"] }));
    expect(res.status).toBe(200);
    expect(saveStartToken).toHaveBeenCalledWith(TOKEN, "sandbox", ["openai-api"]);
  });
  it("rejects a malformed token, a wrong env, a non-array stack", async () => {
    expect((await POST(req({ startToken: "XYZ", env: "sandbox" }))).status).toBe(400);
    expect((await POST(req({ startToken: TOKEN, env: "staging" }))).status).toBe(400);
    expect((await POST(req({ startToken: TOKEN, env: "sandbox", tools: "openai-api" }))).status).toBe(400);
    expect(saveStartToken).not.toHaveBeenCalled();
  });
  it("DELETE forgets it", async () => {
    const res = await DELETE(new Request("https://gawk.dev/x", { method: "DELETE", body: JSON.stringify({ startToken: TOKEN, env: "production" }) }));
    expect(res.status).toBe(200);
    expect(removeStartToken).toHaveBeenCalledWith(TOKEN, "production");
  });
});

describe("POST /api/push/apns/live-activity/activity — a running activity's token", () => {
  it("saves it against a known tool", async () => {
    const res = await POST_ACTIVITY(req({ activityToken: TOKEN, toolId: "openai-api", env: "sandbox" }));
    expect(res.status).toBe(200);
    expect(saveActivityToken).toHaveBeenCalledWith(TOKEN, "openai-api", "sandbox");
  });
  it("rejects an unknown tool", async () => {
    expect((await POST_ACTIVITY(req({ activityToken: TOKEN, toolId: "made-up", env: "sandbox" }))).status).toBe(400);
    expect(saveActivityToken).not.toHaveBeenCalled();
  });
});
