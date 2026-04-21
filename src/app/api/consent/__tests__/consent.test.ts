import { describe, expect, it, beforeEach } from "vitest";
import {
  handleConsentGet,
  handleConsentPost,
} from "@/app/api/consent/route";
import { handleConsentDelete } from "@/app/api/consent/delete/route";
import type { UserRouteContext } from "@/app/api/_lib/userRoute";
import { MockRedis } from "@/lib/data/__tests__/helpers/mock-redis";
import {
  consentKey,
  listAudit,
  type ConsentClient,
  type ConsentState,
} from "@/lib/data/consent";
import { VISITOR_COOKIE, CONSENT_COOKIE } from "@/lib/consent-cookies";

function ctx(
  init: {
    method?: "GET" | "POST";
    cookie?: string;
    body?: unknown;
    headers?: Record<string, string>;
    url?: string;
  } = {},
): UserRouteContext {
  const extra = init.headers ?? {};
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {
    ...extra,
    ...(init.cookie ? { cookie: init.cookie } : {}),
  };
  const reqInit: RequestInit = { method, headers };
  if (method === "POST") {
    headers["content-type"] = "application/json";
    reqInit.body =
      typeof init.body === "string"
        ? init.body
        : JSON.stringify(init.body ?? {});
  }
  return {
    request: new Request(init.url ?? "https://aipulse.dev/api/consent", reqInit),
    traceId: "trace-consent",
  };
}

function setCookieSubs(resp: Response): string {
  return resp.headers.get("set-cookie") ?? "";
}

describe("handleConsentGet", () => {
  let redis: MockRedis;
  let client: ConsentClient;

  beforeEach(() => {
    redis = new MockRedis();
    client = redis as unknown as ConsentClient;
  });

  it("mints a visitor id on first request and sets the aip_visitor cookie", async () => {
    const resp = await handleConsentGet(ctx(), {
      consentClient: client,
      mintId: () => "v-new",
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.visitorId).toBe("v-new");
    expect(setCookieSubs(resp)).toContain(`${VISITOR_COOKIE}=v-new`);
  });

  it("reuses the visitor id from cookie when present", async () => {
    const resp = await handleConsentGet(
      ctx({ cookie: `${VISITOR_COOKIE}=v-returning` }),
      { consentClient: client, mintId: () => "should-not-be-used" },
    );
    const body = await resp.json();
    expect(body.visitorId).toBe("v-returning");
  });

  it("returns stored categories when a record exists", async () => {
    const stored: ConsentState = {
      visitorId: "v-stored",
      categories: { necessary: true, analytics: true, marketing: false },
      updatedAt: "2026-04-20T10:00:00.000Z",
      geo: { country: "DE", region: null, covered: true },
    };
    await redis.set(consentKey("v-stored"), JSON.stringify(stored));
    const resp = await handleConsentGet(
      ctx({ cookie: `${VISITOR_COOKIE}=v-stored` }),
      { consentClient: client },
    );
    const body = await resp.json();
    expect(body.categories).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
    });
    expect(body.gpc).toBe(false);
  });

  it("returns default-deny categories when no record exists", async () => {
    const resp = await handleConsentGet(
      ctx({ cookie: `${VISITOR_COOKIE}=v-empty` }),
      { consentClient: client },
    );
    const body = await resp.json();
    expect(body.categories).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });

  it("honours Sec-GPC:1 by coercing categories to (true,false,false) even when stored as true", async () => {
    const stored: ConsentState = {
      visitorId: "v-gpc",
      categories: { necessary: true, analytics: true, marketing: true },
      updatedAt: "2026-04-20T10:00:00.000Z",
      geo: { country: "DE", region: null, covered: true },
    };
    await redis.set(consentKey("v-gpc"), JSON.stringify(stored));
    const resp = await handleConsentGet(
      ctx({
        cookie: `${VISITOR_COOKIE}=v-gpc`,
        headers: { "sec-gpc": "1" },
      }),
      { consentClient: client },
    );
    const body = await resp.json();
    expect(body.gpc).toBe(true);
    expect(body.categories).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });

  it("reports covered=true for EU country headers", async () => {
    const resp = await handleConsentGet(
      ctx({
        cookie: `${VISITOR_COOKIE}=v-1`,
        headers: { "x-vercel-ip-country": "FR" },
      }),
      { consentClient: client },
    );
    const body = await resp.json();
    expect(body.covered).toBe(true);
  });

  it("reports covered=false for non-covered jurisdictions", async () => {
    const resp = await handleConsentGet(
      ctx({
        cookie: `${VISITOR_COOKIE}=v-1`,
        headers: { "x-vercel-ip-country": "JP" },
      }),
      { consentClient: client },
    );
    const body = await resp.json();
    expect(body.covered).toBe(false);
  });
});

describe("handleConsentPost", () => {
  let redis: MockRedis;
  let client: ConsentClient;

  beforeEach(() => {
    redis = new MockRedis();
    client = redis as unknown as ConsentClient;
  });

  it("writes a grant state and appends to audit", async () => {
    const resp = await handleConsentPost(
      ctx({
        method: "POST",
        cookie: `${VISITOR_COOKIE}=v-grant`,
        body: { analytics: true, marketing: false, action: "grant" },
        headers: { "x-vercel-ip-country": "DE" },
      }),
      {
        consentClient: client,
        rateLimitClient: redis as unknown as ConsentClient,
      },
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.categories).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
    });
    expect(body.coerced).toBeFalsy();
    const entries = await listAudit(new Date(), 10, { client });
    expect(entries[0].action).toBe("grant");
    expect(entries[0].categories.analytics).toBe(true);
  });

  it("mints + sets aip_visitor when the caller has no visitor cookie", async () => {
    const resp = await handleConsentPost(
      ctx({
        method: "POST",
        body: { analytics: false, marketing: false, action: "grant" },
      }),
      {
        consentClient: client,
        rateLimitClient: redis as unknown as ConsentClient,
        mintId: () => "v-fresh",
      },
    );
    expect(setCookieSubs(resp)).toContain(`${VISITOR_COOKIE}=v-fresh`);
    const body = await resp.json();
    expect(body.visitorId).toBe("v-fresh");
  });

  it("sets aip_consent cookie reflecting the effective state", async () => {
    const resp = await handleConsentPost(
      ctx({
        method: "POST",
        cookie: `${VISITOR_COOKIE}=v-cookie`,
        body: { analytics: true, marketing: true, action: "grant" },
      }),
      {
        consentClient: client,
        rateLimitClient: redis as unknown as ConsentClient,
      },
    );
    expect(setCookieSubs(resp)).toContain(CONSENT_COOKIE);
  });

  it("coerces analytics+marketing to false when Sec-GPC:1 is set, and reports coerced=true", async () => {
    const resp = await handleConsentPost(
      ctx({
        method: "POST",
        cookie: `${VISITOR_COOKIE}=v-gpc`,
        body: { analytics: true, marketing: true, action: "grant" },
        headers: { "sec-gpc": "1" },
      }),
      {
        consentClient: client,
        rateLimitClient: redis as unknown as ConsentClient,
      },
    );
    const body = await resp.json();
    expect(body.coerced).toBe(true);
    expect(body.categories).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
    const stored = await redis.get(consentKey("v-gpc"));
    const record = JSON.parse(stored as string);
    expect(record.categories.analytics).toBe(false);
    expect(record.categories.marketing).toBe(false);
  });

  it("rejects a body with invalid fields as 400 BAD_FIELDS", async () => {
    const resp = await handleConsentPost(
      ctx({
        method: "POST",
        cookie: `${VISITOR_COOKIE}=v-bad`,
        body: { analytics: "yes", marketing: false, action: "grant" },
      }),
      {
        consentClient: client,
        rateLimitClient: redis as unknown as ConsentClient,
      },
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.code).toBe("BAD_FIELDS");
  });

  it("rejects an unknown action value as 400 BAD_FIELDS", async () => {
    const resp = await handleConsentPost(
      ctx({
        method: "POST",
        cookie: `${VISITOR_COOKIE}=v-bad`,
        body: { analytics: true, marketing: false, action: "yolo" },
      }),
      {
        consentClient: client,
        rateLimitClient: redis as unknown as ConsentClient,
      },
    );
    expect(resp.status).toBe(400);
  });

  it("rate-limits after 30 calls in the window", async () => {
    const cookie = `${VISITOR_COOKIE}=v-flood`;
    for (let i = 0; i < 30; i++) {
      const resp = await handleConsentPost(
        ctx({
          method: "POST",
          cookie,
          body: { analytics: false, marketing: false, action: "update" },
        }),
        {
          consentClient: client,
          rateLimitClient: redis as unknown as ConsentClient,
        },
      );
      expect(resp.status).toBe(200);
    }
    const tooMany = await handleConsentPost(
      ctx({
        method: "POST",
        cookie,
        body: { analytics: false, marketing: false, action: "update" },
      }),
      {
        consentClient: client,
        rateLimitClient: redis as unknown as ConsentClient,
      },
    );
    expect(tooMany.status).toBe(429);
  });
});

describe("handleConsentDelete", () => {
  let redis: MockRedis;
  let client: ConsentClient;

  beforeEach(() => {
    redis = new MockRedis();
    client = redis as unknown as ConsentClient;
  });

  it("returns 400 NO_VISITOR when no aip_visitor cookie is set", async () => {
    const resp = await handleConsentDelete(ctx({ method: "POST" }), {
      consentClient: client,
      rateLimitClient: redis as unknown as ConsentClient,
    });
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.code).toBe("NO_VISITOR");
  });

  it("deletes the record and writes a tombstone", async () => {
    await redis.set(
      consentKey("v-del"),
      JSON.stringify({
        visitorId: "v-del",
        categories: { necessary: true, analytics: true, marketing: true },
        updatedAt: "2026-04-20T10:00:00.000Z",
        geo: { country: "DE", region: null, covered: true },
      }),
    );
    const resp = await handleConsentDelete(
      ctx({
        method: "POST",
        cookie: `${VISITOR_COOKIE}=v-del`,
        headers: { "x-vercel-ip-country": "DE" },
      }),
      {
        consentClient: client,
        rateLimitClient: redis as unknown as ConsentClient,
      },
    );
    expect(resp.status).toBe(200);
    expect(await redis.get(consentKey("v-del"))).toBeNull();
    const entries = await listAudit(new Date(), 10, { client });
    const tomb = entries.find((e) => e.action === "delete");
    expect(tomb?.visitorId).toBe("v-del");
  });

  it("clears the aip_consent cookie on response", async () => {
    const resp = await handleConsentDelete(
      ctx({ method: "POST", cookie: `${VISITOR_COOKIE}=v-x` }),
      {
        consentClient: client,
        rateLimitClient: redis as unknown as ConsentClient,
      },
    );
    expect(setCookieSubs(resp).toLowerCase()).toMatch(/max-age=0/);
  });

  it("rate-limits the delete endpoint at 10/hr", async () => {
    const cookie = `${VISITOR_COOKIE}=v-flood-del`;
    for (let i = 0; i < 10; i++) {
      const resp = await handleConsentDelete(
        ctx({ method: "POST", cookie }),
        {
          consentClient: client,
          rateLimitClient: redis as unknown as ConsentClient,
        },
      );
      expect(resp.status).toBe(200);
    }
    const blocked = await handleConsentDelete(ctx({ method: "POST", cookie }), {
      consentClient: client,
      rateLimitClient: redis as unknown as ConsentClient,
    });
    expect(blocked.status).toBe(429);
  });
});
