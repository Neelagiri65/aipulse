/**
 * The push toggle × stack. No DOM environment here, so two things are
 * pinned: the server HTML never depends on storage, and the registration
 * call sends the stack (or an explicit empty list, which clears a scope).
 * The "re-register only on STACK_CHANGE_EVENT, never on mount" rule is by
 * construction (the effect only adds a listener) and is exercised by the
 * prod journey, not here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PushAlertToggle, registerSubscription } from "@/components/chrome/PushAlertToggle";

describe("server HTML does not depend on storage", () => {
  it("renders 'Enable alerts' byte-identically with and without a stored stack", () => {
    const g = globalThis as { localStorage?: unknown };
    const a = renderToStaticMarkup(<PushAlertToggle />);
    g.localStorage = { getItem: () => JSON.stringify(["cursor"]) };
    const b = renderToStaticMarkup(<PushAlertToggle />);
    delete g.localStorage;
    expect(b).toBe(a);
    expect(a).toContain("Enable alerts");
    expect(a).toContain('data-scope="0"');
  });
});

describe("registerSubscription — what the server is told", () => {
  const sub = {
    endpoint: "https://push.example/x",
    toJSON: () => ({ endpoint: "https://push.example/x", expirationTime: null, keys: { p256dh: "P", auth: "A" } }),
  } as unknown as PushSubscription;
  const fetchMock = vi.fn(async () => ({ ok: true }));
  afterEach(() => fetchMock.mockClear());

  it("sends the stack ids alongside the subscription", async () => {
    vi.stubGlobal("fetch", fetchMock);
    expect(await registerSubscription(sub, ["cursor", "copilot"])).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/push/subscribe");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      endpoint: "https://push.example/x",
      expirationTime: null,
      keys: { p256dh: "P", auth: "A" },
      tools: ["cursor", "copilot"],
    });
    vi.unstubAllGlobals();
  });

  it("no stack sends an explicit empty list, so a rewrite clears an earlier scope", async () => {
    vi.stubGlobal("fetch", fetchMock);
    await registerSubscription(sub, null);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).tools).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("reports a failed registration", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    expect(await registerSubscription(sub, null)).toBe(false);
    vi.unstubAllGlobals();
  });
});
