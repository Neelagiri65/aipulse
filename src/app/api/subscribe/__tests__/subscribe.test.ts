import { describe, expect, it, beforeEach } from "vitest";
import { handleSubscribe } from "@/app/api/subscribe/route";
import type { UserRouteContext } from "@/app/api/_lib/userRoute";
import { MockRedis } from "@/lib/data/__tests__/helpers/mock-redis";
import type { SubscriberClient } from "@/lib/data/subscribers";
import type { EmailSender, SendResult } from "@/lib/email/resend";
import { hashEmail } from "@/lib/email/hash";
import {
  subscriberKey,
  confirmTokenKey,
  unsubTokenKey,
} from "@/lib/data/subscribers";

const SECRET = "test-signing-secret-0123456789";

type Captured = {
  to: string;
  subject: string;
  reactString: string;
};

/**
 * Recursively walk a React element tree and return every href string we
 * find. Lets the test assert on the URLs inside the email without having
 * to render the whole template.
 */
function collectHrefs(node: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<unknown>();
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object" || seen.has(n)) return;
    seen.add(n);
    const obj = n as Record<string, unknown>;
    if (typeof obj.href === "string") found.push(obj.href);
    for (const key of ["props", "children"]) {
      if (key in obj) visit(obj[key]);
    }
    if (Array.isArray(obj)) obj.forEach(visit);
  };
  visit(node);
  return found;
}

function makeSender(result: SendResult): {
  sender: EmailSender;
  calls: Captured[];
  hrefs: () => string[];
} {
  const calls: Captured[] = [];
  const allHrefs: string[] = [];
  const sender: EmailSender = {
    async send(opts) {
      allHrefs.push(...collectHrefs(opts.react));
      calls.push({
        to: opts.to,
        subject: opts.subject,
        reactString: JSON.stringify(opts.react, (_, v) =>
          typeof v === "function" ? "[fn]" : v,
        ).slice(0, 2000),
      });
      return result;
    },
  };
  return { sender, calls, hrefs: () => allHrefs };
}

function turnstilePass(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

function turnstileFail(): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({ success: false, "error-codes": ["bad-token"] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;
}

function makeCtx(
  body: unknown,
  headers: Record<string, string> = {},
): UserRouteContext {
  const request = new Request("https://gawk.dev/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { request, traceId: "trace-abc" };
}

describe("handleSubscribe — happy path", () => {
  let redis: MockRedis;
  let subscriberClient: SubscriberClient;

  beforeEach(() => {
    redis = new MockRedis();
    subscriberClient = redis as unknown as SubscriberClient;
  });

  it("creates a pending subscriber and sends a confirm email on first submit", async () => {
    const { sender, calls, hrefs } = makeSender({ ok: true, id: "msg-1" });
    const resp = await handleSubscribe(
      makeCtx({ email: "User@Example.com", turnstileToken: "tkn" }, {
        "x-forwarded-for": "1.2.3.4",
      }),
      {
        subscriberClient,
        rateLimitClient: redis as unknown as SubscriberClient,
        sender,
        verifyFetch: turnstilePass(),
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { status: string; traceId: string };
    expect(body.status).toBe("pending");
    expect(body.traceId).toBe("trace-abc");
    expect(resp.headers.get("x-aip-trace")).toBe("trace-abc");
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe("user@example.com");
    const allHrefs = hrefs();
    expect(allHrefs.some((h) => h.includes("/api/subscribe/confirm?token="))).toBe(
      true,
    );
    // S48h decision (commit c3a0428, "feat(email): rewrite confirmation
    // template for clarity + recovery"): the pre-confirmation email
    // DELIBERATELY does not render an unsubscribe link — the recipient
    // hasn't agreed to anything yet, and "ignore this email and no
    // address will be added" is the correct opt-out before consent.
    // The unsub token IS still generated and stored (used by the
    // post-confirmation daily digest), it just isn't surfaced in the
    // confirmation email body. Assert both halves of that contract.
    expect(
      allHrefs.some((h) => h.includes("/api/subscribe/unsubscribe?token=")),
    ).toBe(false);

    const stored = await redis.get(subscriberKey(hashEmail("user@example.com")));
    expect(stored).toBeTruthy();
    const record = JSON.parse(stored as string);
    expect(record.status).toBe("pending");
    expect(record.confirmToken).toBeTruthy();
    expect(record.unsubToken).toBeTruthy();
  });

  it("writes reverse-lookup indexes for both tokens", async () => {
    const { sender } = makeSender({ ok: true, id: "msg-1" });
    await handleSubscribe(
      makeCtx({ email: "a@b.com", turnstileToken: "tkn" }),
      {
        subscriberClient,
        sender,
        verifyFetch: turnstilePass(),
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    const stored = await redis.get(subscriberKey(hashEmail("a@b.com")));
    const record = JSON.parse(stored as string);
    expect(await redis.get(confirmTokenKey(record.confirmToken))).toBe(
      hashEmail("a@b.com"),
    );
    expect(await redis.get(unsubTokenKey(record.unsubToken))).toBe(
      hashEmail("a@b.com"),
    );
  });

  it("captures geo into the record from Vercel headers when covered", async () => {
    const { sender } = makeSender({ ok: true, id: "m" });
    await handleSubscribe(
      makeCtx(
        { email: "eu@b.com", turnstileToken: "tkn" },
        { "x-vercel-ip-country": "FR" },
      ),
      {
        subscriberClient,
        sender,
        verifyFetch: turnstilePass(),
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    const stored = await redis.get(subscriberKey(hashEmail("eu@b.com")));
    const record = JSON.parse(stored as string);
    expect(record.geo).toEqual({ country: "FR", region: null, covered: true });
  });

  it("returns already_confirmed and does not send email when subscriber is confirmed", async () => {
    const email = "existing@b.com";
    const emailHash = hashEmail(email);
    await redis.set(
      subscriberKey(emailHash),
      JSON.stringify({
        emailHash,
        status: "confirmed",
        geo: { country: null, region: null, covered: false },
        consentCategories: { necessary: true, analytics: false, marketing: false },
        createdAt: "2026-04-01T00:00:00.000Z",
        confirmedAt: "2026-04-02T00:00:00.000Z",
        unsubToken: "existing-unsub",
      }),
    );
    const { sender, calls } = makeSender({ ok: true, id: "m" });
    const resp = await handleSubscribe(
      makeCtx({ email, turnstileToken: "tkn" }),
      {
        subscriberClient,
        sender,
        verifyFetch: turnstilePass(),
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    const body = (await resp.json()) as { status: string };
    expect(body.status).toBe("already_confirmed");
    expect(calls).toHaveLength(0);
  });

  it("re-sends the existing confirm token when pending + token still indexed", async () => {
    const email = "pending@b.com";
    const emailHash = hashEmail(email);
    const confirmToken = "stable.confirm.token.xyz";
    const unsubToken = "stable.unsub.token.xyz";
    await redis.set(
      subscriberKey(emailHash),
      JSON.stringify({
        emailHash,
        status: "pending",
        geo: { country: null, region: null, covered: false },
        consentCategories: { necessary: true, analytics: false, marketing: false },
        createdAt: "2026-04-01T00:00:00.000Z",
        confirmToken,
        unsubToken,
      }),
    );
    await redis.set(confirmTokenKey(confirmToken), emailHash);
    const { sender, calls, hrefs } = makeSender({ ok: true, id: "m" });
    const resp = await handleSubscribe(
      makeCtx({ email, turnstileToken: "tkn" }),
      {
        subscriberClient,
        sender,
        verifyFetch: turnstilePass(),
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    const body = (await resp.json()) as { status: string };
    expect(body.status).toBe("resent");
    expect(calls).toHaveLength(1);
    expect(hrefs().some((h) => h.includes(confirmToken))).toBe(true);
  });

  it("treats an unsubscribed record as a new subscribe (resets to pending)", async () => {
    const email = "back@b.com";
    const emailHash = hashEmail(email);
    await redis.set(
      subscriberKey(emailHash),
      JSON.stringify({
        emailHash,
        status: "unsubscribed",
        geo: { country: null, region: null, covered: false },
        consentCategories: { necessary: true, analytics: false, marketing: false },
        createdAt: "2026-04-01T00:00:00.000Z",
        unsubscribedAt: "2026-04-02T00:00:00.000Z",
        unsubToken: "keep-this-unsub",
      }),
    );
    const { sender } = makeSender({ ok: true, id: "m" });
    const resp = await handleSubscribe(
      makeCtx({ email, turnstileToken: "tkn" }),
      {
        subscriberClient,
        sender,
        verifyFetch: turnstilePass(),
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    const body = (await resp.json()) as { status: string };
    expect(body.status).toBe("pending");
    const stored = await redis.get(subscriberKey(emailHash));
    const record = JSON.parse(stored as string);
    expect(record.status).toBe("pending");
    expect(record.unsubToken).toBe("keep-this-unsub");
  });
});

describe("handleSubscribe — validation + gating", () => {
  let redis: MockRedis;
  let subscriberClient: SubscriberClient;

  beforeEach(() => {
    redis = new MockRedis();
    subscriberClient = redis as unknown as SubscriberClient;
  });

  it("returns 400 HONEYPOT when the website field is populated", async () => {
    const resp = await handleSubscribe(
      makeCtx({ email: "a@b.com", turnstileToken: "tkn", website: "gotcha" }),
      {
        subscriberClient,
        tokenSecret: SECRET,
        turnstileSecret: "s",
        verifyFetch: turnstilePass(),
      },
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.code).toBe("HONEYPOT");
  });

  it("returns 400 BAD_BODY on non-JSON payload", async () => {
    const ctx = makeCtx("not json");
    const resp = await handleSubscribe(ctx, {
      subscriberClient,
      tokenSecret: SECRET,
      turnstileSecret: "s",
    });
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.code).toBe("BAD_BODY");
  });

  it("returns 400 INVALID_EMAIL on malformed address", async () => {
    const resp = await handleSubscribe(
      makeCtx({ email: "not-an-email", turnstileToken: "tkn" }),
      {
        subscriberClient,
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.code).toBe("INVALID_EMAIL");
  });

  it("returns 400 TURNSTILE_FAILED when Turnstile rejects the token", async () => {
    const resp = await handleSubscribe(
      makeCtx({ email: "a@b.com", turnstileToken: "bad" }),
      {
        subscriberClient,
        verifyFetch: turnstileFail(),
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.code).toBe("TURNSTILE_FAILED");
  });

  it("returns 429 RATE_LIMITED after 5 submits from the same IP within the window", async () => {
    const { sender } = makeSender({ ok: true, id: "m" });
    const headers = { "x-forwarded-for": "9.9.9.9" };
    for (let i = 0; i < 5; i++) {
      const resp = await handleSubscribe(
        makeCtx({ email: `a${i}@b.com`, turnstileToken: "tkn" }, headers),
        {
          subscriberClient,
          rateLimitClient: redis as unknown as SubscriberClient,
          sender,
          verifyFetch: turnstilePass(),
          tokenSecret: SECRET,
          turnstileSecret: "s",
        },
      );
      expect(resp.status).toBe(200);
    }
    const sixth = await handleSubscribe(
      makeCtx({ email: "a6@b.com", turnstileToken: "tkn" }, headers),
      {
        subscriberClient,
        rateLimitClient: redis as unknown as SubscriberClient,
        sender,
        verifyFetch: turnstilePass(),
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    expect(sixth.status).toBe(429);
    const body = await sixth.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(sixth.headers.get("retry-after")).toBeTruthy();
  });
});

describe("handleSubscribe — delivery failures", () => {
  let redis: MockRedis;
  let subscriberClient: SubscriberClient;

  beforeEach(() => {
    redis = new MockRedis();
    subscriberClient = redis as unknown as SubscriberClient;
  });

  it("returns 202 pending+deferred on Resend 5xx — record IS written, send is queued for retry", async () => {
    const { sender } = makeSender({ ok: false, queued: true, error: "upstream 503" });
    const resp = await handleSubscribe(
      makeCtx({ email: "a@b.com", turnstileToken: "tkn" }),
      {
        subscriberClient,
        sender,
        verifyFetch: turnstilePass(),
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    expect(resp.status).toBe(202);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("pending");
    expect(body.delivery).toBe("deferred");
  });

  it("returns 202 pending+deferred on Resend 4xx (e.g. domain unverified) — record IS written, operator sees the loud server log", async () => {
    const { sender } = makeSender({ ok: false, fatal: true, error: "bad from" });
    const resp = await handleSubscribe(
      makeCtx({ email: "a@b.com", turnstileToken: "tkn" }),
      {
        subscriberClient,
        sender,
        verifyFetch: turnstilePass(),
        tokenSecret: SECRET,
        turnstileSecret: "s",
      },
    );
    expect(resp.status).toBe(202);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("pending");
    expect(body.delivery).toBe("deferred");
  });
});
