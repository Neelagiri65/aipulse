import { describe, expect, it } from "vitest";
import {
  sendDigest,
  type BatchSendResult,
  type BatchSender,
} from "@/lib/digest/sender";
import type { DigestRecipient } from "@/lib/digest/batch";

function r(i: number): DigestRecipient {
  return {
    emailHash: `h${i}`,
    email: `u${i}@x.com`,
    unsubToken: `tok-${i}`,
    geo: { country: "GB", region: null, covered: true },
  };
}

function baseInput(
  recipients: readonly DigestRecipient[],
  batchSender: BatchSender,
  extra: Partial<Parameters<typeof sendDigest>[0]> = {},
): Parameters<typeof sendDigest>[0] {
  return {
    recipients,
    from: "Gawk <digest@gawk.dev>",
    subject: "Gawk — 2026-04-22",
    unsubBaseUrl: "https://gawk.dev/api/subscribe/unsubscribe",
    unsubMailto: "mailto:unsub@gawk.dev",
    listId: "digest-2026-04-22.gawk.dev",
    renderHtml: (rec) => `<p>${rec.email}</p>`,
    batchSender,
    sleepFn: async () => {},
    ...extra,
  };
}

function okSender(ids: string[]): BatchSender {
  return {
    sendBatch: async () => ({ ok: true, ids }) as BatchSendResult,
  };
}

describe("sendDigest — happy path", () => {
  it("sends a single chunk of recipients and returns sent count", async () => {
    const sender = okSender(["id1", "id2"]);
    const result = await sendDigest(
      baseInput([r(1), r(2)], sender, { chunkSize: 100 }),
    );
    expect(result.sent).toBe(2);
    expect(result.bounced).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.attemptedChunks).toBe(1);
    expect(result.failedChunks).toBe(0);
  });

  it("chunks recipients by chunkSize and sends each chunk", async () => {
    let calls = 0;
    const sender: BatchSender = {
      sendBatch: async (payload) => {
        calls += 1;
        return { ok: true, ids: payload.map((_, i) => `id-${calls}-${i}`) };
      },
    };
    const recipients = Array.from({ length: 5 }, (_, i) => r(i));
    const result = await sendDigest(
      baseInput(recipients, sender, { chunkSize: 2 }),
    );
    expect(calls).toBe(3);
    expect(result.sent).toBe(5);
    expect(result.attemptedChunks).toBe(3);
  });

  it("returns zero sent for empty recipients and does not call batchSender", async () => {
    let calls = 0;
    const sender: BatchSender = {
      sendBatch: async () => {
        calls += 1;
        return { ok: true, ids: [] };
      },
    };
    const result = await sendDigest(baseInput([], sender));
    expect(calls).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.attemptedChunks).toBe(0);
  });
});

describe("sendDigest — 5xx retry", () => {
  it("retries on 5xx up to maxRetries and succeeds when a retry wins", async () => {
    let call = 0;
    const sender: BatchSender = {
      sendBatch: async () => {
        call += 1;
        if (call < 3) {
          return { ok: false, statusCode: 503, message: "unavailable" };
        }
        return { ok: true, ids: ["a"] };
      },
    };
    const sleeps: number[] = [];
    const result = await sendDigest(
      baseInput([r(1)], sender, {
        sleepFn: async (ms) => {
          sleeps.push(ms);
        },
        maxRetries: 3,
      }),
    );
    expect(result.sent).toBe(1);
    expect(result.failedChunks).toBe(0);
    expect(call).toBe(3);
    // Backoff sequence is 500ms, 1000ms.
    expect(sleeps).toEqual([500, 1000]);
  });

  it("gives up after maxRetries on persistent 5xx", async () => {
    let call = 0;
    const sender: BatchSender = {
      sendBatch: async () => {
        call += 1;
        return { ok: false, statusCode: 500, message: "boom" };
      },
    };
    const result = await sendDigest(
      baseInput([r(1), r(2)], sender, { maxRetries: 3 }),
    );
    expect(result.sent).toBe(0);
    expect(result.failedChunks).toBe(1);
    expect(result.errors).toEqual([{ message: "boom" }]);
    // 1 initial + 3 retries = 4 attempts.
    expect(call).toBe(4);
  });

  it("does not retry on 4xx", async () => {
    let call = 0;
    const sender: BatchSender = {
      sendBatch: async () => {
        call += 1;
        return { ok: false, statusCode: 422, message: "validation failed" };
      },
    };
    await sendDigest(baseInput([r(1)], sender, { maxRetries: 3 }));
    expect(call).toBe(1);
  });
});

describe("sendDigest — 4xx per-email errors", () => {
  it("marks specific recipients as bounced via onBounce and counts sent for the rest", async () => {
    const sender: BatchSender = {
      sendBatch: async () => ({
        ok: false,
        statusCode: 422,
        message: "partial validation failure",
        perEmailErrors: [{ index: 1, message: "mailbox full" }],
      }),
    };
    const bounces: Array<{ hash: string; message: string }> = [];
    const result = await sendDigest(
      baseInput([r(1), r(2), r(3)], sender, {
        onBounce: async (rec, message) => {
          bounces.push({ hash: rec.emailHash, message });
        },
      }),
    );
    expect(bounces).toEqual([{ hash: "h2", message: "mailbox full" }]);
    expect(result.bounced).toEqual(["h2"]);
    // Two of the three succeeded.
    expect(result.sent).toBe(2);
    expect(result.failedChunks).toBe(1);
    expect(result.errors).toEqual([
      { hash: "h2", message: "mailbox full" },
    ]);
  });

  it("skips out-of-range indexes in perEmailErrors", async () => {
    const sender: BatchSender = {
      sendBatch: async () => ({
        ok: false,
        statusCode: 422,
        message: "bad",
        perEmailErrors: [{ index: 99, message: "nope" }],
      }),
    };
    const result = await sendDigest(baseInput([r(1)], sender));
    expect(result.bounced).toEqual([]);
  });
});

describe("sendDigest — onChunkFailure", () => {
  it("invokes onChunkFailure with chunk index and failure on non-retryable error", async () => {
    const sender: BatchSender = {
      sendBatch: async () => ({
        ok: false,
        statusCode: 400,
        message: "bad request",
      }),
    };
    const failures: Array<{ i: number; msg: string }> = [];
    await sendDigest(
      baseInput([r(1)], sender, {
        onChunkFailure: async (i, err) => {
          failures.push({ i, msg: err.message });
        },
      }),
    );
    expect(failures).toEqual([{ i: 0, msg: "bad request" }]);
  });

  it("does not invoke onChunkFailure when the chunk eventually succeeds", async () => {
    let call = 0;
    const sender: BatchSender = {
      sendBatch: async () => {
        call += 1;
        if (call === 1) return { ok: false, statusCode: 503, message: "x" };
        return { ok: true, ids: ["a"] };
      },
    };
    let invoked = false;
    await sendDigest(
      baseInput([r(1)], sender, {
        onChunkFailure: async () => {
          invoked = true;
        },
      }),
    );
    expect(invoked).toBe(false);
  });
});
