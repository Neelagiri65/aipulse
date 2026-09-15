/**
 * POST /api/push/subscribe with and without `tools`. The store is mocked;
 * the assertions are about what the route hands it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn(async (_sub: unknown, _tools: unknown) => ({ ok: true, id: "abcd" }));
const remove = vi.fn(async (_endpoint: unknown) => ({ ok: true }));
vi.mock("@/lib/push/store", () => ({
  savePushSubscription: (sub: unknown, tools: unknown) => save(sub, tools),
  removePushSubscription: (endpoint: unknown) => remove(endpoint),
}));

import { DELETE, POST } from "@/app/api/push/subscribe/route";

const sub = { endpoint: "https://push.example/x", expirationTime: null, keys: { p256dh: "P", auth: "A" } };
const post = (body: unknown) =>
  POST(new Request("https://gawk.dev/api/push/subscribe", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    save.mockClear();
  });

  it("no tools: saves the subscription with no stack (every alert)", async () => {
    const res = await post(sub);
    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalledWith({ endpoint: sub.endpoint, expirationTime: null, keys: sub.keys }, null);
  });

  it("tools: saves the known ids in the visitor's order, drops unknown ones", async () => {
    const res = await post({ ...sub, tools: ["cursor", "nope", "claude-code"] });
    expect(res.status).toBe(200);
    expect(save.mock.calls[0][1]).toEqual(["cursor", "claude-code"]);
  });

  it("an empty tools array is 'everything', stored as no stack", async () => {
    await post({ ...sub, tools: [] });
    expect(save.mock.calls[0][1]).toBeNull();
  });

  it("tools that is not an array is refused, not silently widened", async () => {
    const res = await post({ ...sub, tools: "cursor" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_tools" });
    expect(save).not.toHaveBeenCalled();
  });

  it("still refuses a subscription missing its keys", async () => {
    const res = await post({ endpoint: sub.endpoint, keys: { p256dh: "P" } });
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("only the subscription fields reach the store — extra body fields are dropped", async () => {
    await post({ ...sub, tools: ["copilot"], somethingElse: true });
    expect(save.mock.calls[0][0]).toEqual({ endpoint: sub.endpoint, expirationTime: null, keys: sub.keys });
  });
});

describe("DELETE /api/push/subscribe", () => {
  it("removes by endpoint", async () => {
    const res = await DELETE(new Request("https://gawk.dev/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) }));
    expect(res.status).toBe(200);
    expect(remove).toHaveBeenCalledWith(sub.endpoint);
  });
});
