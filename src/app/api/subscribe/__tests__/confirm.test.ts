import { describe, expect, it, beforeEach } from "vitest";
import { handleConfirm } from "@/app/api/subscribe/confirm/route";
import type { UserRouteContext } from "@/app/api/_lib/userRoute";
import { MockRedis } from "@/lib/data/__tests__/helpers/mock-redis";
import type { SubscriberClient } from "@/lib/data/subscribers";
import { hashEmail, mintToken } from "@/lib/email/hash";
import {
  subscriberKey,
  confirmTokenKey,
  indexConfirmToken,
  writeSubscriber,
} from "@/lib/data/subscribers";

const SECRET = "confirm-test-secret-123";

function makeCtx(url: string): UserRouteContext {
  return {
    request: new Request(url),
    traceId: "trace-confirm",
  };
}

function mintConfirm(emailHash: string, ttlSec = 3600): string {
  return mintToken(
    { kind: "confirm", emailHash, ttlSec },
    SECRET,
  );
}

function seedPending(
  redis: MockRedis,
  email: string,
  token: string,
): string {
  const emailHash = hashEmail(email);
  const record = {
    emailHash,
    status: "pending" as const,
    geo: { country: null, region: null, covered: false },
    consentCategories: { necessary: true as const, analytics: false, marketing: false },
    createdAt: "2026-04-01T00:00:00.000Z",
    confirmToken: token,
    unsubToken: "u",
  };
  void writeSubscriber(record, { client: redis as unknown as SubscriberClient });
  void indexConfirmToken(token, emailHash, 3600, {
    client: redis as unknown as SubscriberClient,
  });
  return emailHash;
}

describe("handleConfirm", () => {
  let redis: MockRedis;
  let client: SubscriberClient;

  beforeEach(() => {
    redis = new MockRedis();
    client = redis as unknown as SubscriberClient;
  });

  it("redirects to state=invalid when token is missing", async () => {
    const resp = await handleConfirm(
      makeCtx("https://gawk.dev/api/subscribe/confirm"),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.status).toBe(302);
    expect(resp.headers.get("location")).toMatch(/state=invalid/);
    expect(resp.headers.get("x-aip-trace")).toBe("trace-confirm");
  });

  it("redirects to state=invalid on malformed token", async () => {
    const resp = await handleConfirm(
      makeCtx("https://gawk.dev/api/subscribe/confirm?token=garbage"),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.headers.get("location")).toMatch(/state=invalid/);
  });

  it("redirects to state=invalid on bad signature", async () => {
    const token = mintToken({ kind: "confirm", emailHash: "x", ttlSec: 60 }, "other-secret");
    const resp = await handleConfirm(
      makeCtx(`https://gawk.dev/api/subscribe/confirm?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.headers.get("location")).toMatch(/state=invalid/);
  });

  it("redirects to state=expired when token is past its exp", async () => {
    const token = mintToken(
      { kind: "confirm", emailHash: "x", ttlSec: 60, nowMs: 1_000_000 },
      SECRET,
    );
    const resp = await handleConfirm(
      makeCtx(`https://gawk.dev/api/subscribe/confirm?token=${token}`),
      {
        subscriberClient: client,
        tokenSecret: SECRET,
        now: () => 1_000_000 + 120 * 1000, // 2 minutes later
      },
    );
    expect(resp.headers.get("location")).toMatch(/state=expired/);
  });

  it("redirects to state=invalid when token kind is wrong (unsub token)", async () => {
    const token = mintToken({ kind: "unsub", emailHash: "x" }, SECRET);
    const resp = await handleConfirm(
      makeCtx(`https://gawk.dev/api/subscribe/confirm?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.headers.get("location")).toMatch(/state=invalid/);
  });

  it("redirects to state=not-found when token is valid but Redis has no record", async () => {
    const token = mintConfirm("never-seeded");
    const resp = await handleConfirm(
      makeCtx(`https://gawk.dev/api/subscribe/confirm?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.headers.get("location")).toMatch(/state=not-found/);
  });

  it("flips pending → confirmed and redirects to state=ok", async () => {
    const email = "new@b.com";
    const emailHash = hashEmail(email);
    const token = mintConfirm(emailHash);
    seedPending(redis, email, token);
    const resp = await handleConfirm(
      makeCtx(`https://gawk.dev/api/subscribe/confirm?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.headers.get("location")).toMatch(/state=ok/);
    const raw = await redis.get(subscriberKey(emailHash));
    const rec = JSON.parse(raw as string);
    expect(rec.status).toBe("confirmed");
    expect(rec.confirmedAt).toBeTruthy();
    expect(rec.confirmToken).toBeUndefined();
  });

  it("deletes the reverse-lookup index on flip so re-use fails", async () => {
    const email = "idem@b.com";
    const emailHash = hashEmail(email);
    const token = mintConfirm(emailHash);
    seedPending(redis, email, token);
    await handleConfirm(
      makeCtx(`https://gawk.dev/api/subscribe/confirm?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(await redis.get(confirmTokenKey(token))).toBeNull();
  });

  it("is idempotent — re-clicking the link after flip redirects to state=ok via emailHash fallback", async () => {
    // Real-world scenario: iOS Mail / Gmail / Outlook prefetch the
    // confirmation URL to scan for malware. That first GET deletes the
    // token reverse-index. When the human taps the button afterwards,
    // findByConfirmToken misses — but the HMAC-signed emailHash in the
    // token payload still resolves to a confirmed subscriber, so we
    // land cleanly on state=ok rather than the misleading not-found.
    const email = "already@b.com";
    const emailHash = hashEmail(email);
    const token = mintConfirm(emailHash);
    seedPending(redis, email, token);
    await handleConfirm(
      makeCtx(`https://gawk.dev/api/subscribe/confirm?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    const resp2 = await handleConfirm(
      makeCtx(`https://gawk.dev/api/subscribe/confirm?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp2.status).toBe(302);
    expect(resp2.headers.get("location")).toMatch(/state=ok/);
  });

  it("returns not-found only when the emailHash has no subscriber at all", async () => {
    // Token signature valid, but Redis has no record for that emailHash.
    // This is the genuine not-found case — distinct from the prefetch
    // scenario above where the subscriber exists but the token-index
    // was already consumed.
    const token = mintConfirm("ghost-email-hash");
    const resp = await handleConfirm(
      makeCtx(`https://gawk.dev/api/subscribe/confirm?token=${token}`),
      { subscriberClient: client, tokenSecret: SECRET },
    );
    expect(resp.headers.get("location")).toMatch(/state=not-found/);
  });
});
