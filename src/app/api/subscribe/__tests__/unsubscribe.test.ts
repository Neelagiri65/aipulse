import { describe, expect, it, beforeEach } from "vitest";
import { handleUnsubscribe } from "@/app/api/subscribe/unsubscribe/route";
import type { UserRouteContext } from "@/app/api/_lib/userRoute";
import { MockRedis } from "@/lib/data/__tests__/helpers/mock-redis";
import type { SubscriberClient } from "@/lib/data/subscribers";
import { hashEmail, mintToken } from "@/lib/email/hash";
import {
  subscriberKey,
  indexUnsubToken,
  writeSubscriber,
} from "@/lib/data/subscribers";
import type { EmailSender, SendResult } from "@/lib/email/resend";

const SECRET = "unsub-test-secret-123";

function makeCtx(url: string): UserRouteContext {
  return { request: new Request(url), traceId: "trace-unsub" };
}

function mintUnsub(emailHash: string): string {
  return mintToken({ kind: "unsub", emailHash }, SECRET);
}

async function seedConfirmed(
  redis: MockRedis,
  email: string,
  token: string,
): Promise<string> {
  const emailHash = hashEmail(email);
  await writeSubscriber(
    {
      emailHash,
      status: "confirmed",
      geo: { country: null, region: null, covered: false },
      consentCategories: { necessary: true, analytics: false, marketing: false },
      createdAt: "2026-04-01T00:00:00.000Z",
      confirmedAt: "2026-04-02T00:00:00.000Z",
      unsubToken: token,
    },
    { client: redis as unknown as SubscriberClient },
  );
  await indexUnsubToken(token, emailHash, {
    client: redis as unknown as SubscriberClient,
  });
  return emailHash;
}

function captureSender(result: SendResult): {
  sender: EmailSender;
  calls: Array<{ to: string; subject: string }>;
} {
  const calls: Array<{ to: string; subject: string }> = [];
  const sender: EmailSender = {
    async send(opts) {
      calls.push({ to: opts.to, subject: opts.subject });
      return result;
    },
  };
  return { sender, calls };
}

describe("handleUnsubscribe", () => {
  let redis: MockRedis;
  let client: SubscriberClient;

  beforeEach(() => {
    redis = new MockRedis();
    client = redis as unknown as SubscriberClient;
  });

  it("redirects to state=invalid when token missing", async () => {
    const resp = await handleUnsubscribe(
      makeCtx("https://gawk.dev/api/subscribe/unsubscribe"),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.status).toBe(302);
    expect(resp.headers.get("location")).toMatch(
      /\/subscribe\/unsubscribed\?state=invalid/,
    );
  });

  it("redirects to state=invalid on bad-signature token", async () => {
    const token = mintToken({ kind: "unsub", emailHash: "x" }, "other-secret");
    const resp = await handleUnsubscribe(
      makeCtx(`https://gawk.dev/api/subscribe/unsubscribe?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.headers.get("location")).toMatch(/state=invalid/);
  });

  it("redirects to state=invalid when kind is confirm (wrong purpose)", async () => {
    const token = mintToken({ kind: "confirm", emailHash: "x", ttlSec: 60 }, SECRET);
    const resp = await handleUnsubscribe(
      makeCtx(`https://gawk.dev/api/subscribe/unsubscribe?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.headers.get("location")).toMatch(/state=invalid/);
  });

  it("redirects to state=not-found when token valid but record missing", async () => {
    const token = mintUnsub("unknown");
    const resp = await handleUnsubscribe(
      makeCtx(`https://gawk.dev/api/subscribe/unsubscribe?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.headers.get("location")).toMatch(/state=not-found/);
  });

  it("flips confirmed → unsubscribed and redirects to state=ok", async () => {
    const email = "bye@b.com";
    const emailHash = hashEmail(email);
    const token = mintUnsub(emailHash);
    await seedConfirmed(redis, email, token);
    const resp = await handleUnsubscribe(
      makeCtx(`https://gawk.dev/api/subscribe/unsubscribe?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.headers.get("location")).toMatch(/state=ok/);
    const raw = await redis.get(subscriberKey(emailHash));
    const rec = JSON.parse(raw as string);
    expect(rec.status).toBe("unsubscribed");
    expect(rec.unsubscribedAt).toBeTruthy();
  });

  it("is idempotent — second click on an already-unsubscribed record still returns ok and sends no email", async () => {
    const email = "twice@b.com";
    const emailHash = hashEmail(email);
    const token = mintUnsub(emailHash);
    await seedConfirmed(redis, email, token);
    const { sender, calls } = captureSender({ ok: true, id: "m" });
    await handleUnsubscribe(
      makeCtx(`https://gawk.dev/api/subscribe/unsubscribe?token=${token}`),
      {
        subscriberClient: client,
        tokenSecret: SECRET,
        sender,
        resolveEmail: async () => email,
      },
    );
    const second = await handleUnsubscribe(
      makeCtx(`https://gawk.dev/api/subscribe/unsubscribe?token=${token}`),
      {
        subscriberClient: client,
        tokenSecret: SECRET,
        sender,
        resolveEmail: async () => email,
      },
    );
    expect(second.headers.get("location")).toMatch(/state=ok/);
    // Receipt sent once (on first flip), not twice.
    expect(calls).toHaveLength(1);
  });

  it("sends the unsubscribe receipt on the first flip when a resolver is supplied", async () => {
    const email = "receipt@b.com";
    const emailHash = hashEmail(email);
    const token = mintUnsub(emailHash);
    await seedConfirmed(redis, email, token);
    const { sender, calls } = captureSender({ ok: true, id: "m" });
    await handleUnsubscribe(
      makeCtx(`https://gawk.dev/api/subscribe/unsubscribe?token=${token}`),
      {
        subscriberClient: client,
        tokenSecret: SECRET,
        sender,
        resolveEmail: async (h) => (h === emailHash ? email : null),
      },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe(email);
    expect(calls[0].subject).toMatch(/unsubscribed/i);
  });

  it("skips the receipt when no resolver is wired (day-1 fallback)", async () => {
    const email = "noreceipt@b.com";
    const emailHash = hashEmail(email);
    const token = mintUnsub(emailHash);
    await seedConfirmed(redis, email, token);
    const { sender, calls } = captureSender({ ok: true, id: "m" });
    const resp = await handleUnsubscribe(
      makeCtx(`https://gawk.dev/api/subscribe/unsubscribe?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET, sender },
    );
    expect(resp.headers.get("location")).toMatch(/state=ok/);
    expect(calls).toHaveLength(0);
  });
});
