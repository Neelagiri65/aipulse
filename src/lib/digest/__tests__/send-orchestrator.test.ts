import { describe, expect, it, vi } from "vitest";
import { sendDigestForDate, buildListId } from "@/lib/digest/send-orchestrator";
import type { DailySnapshot } from "@/lib/data/snapshot";
import type { HnWireResult } from "@/lib/data/wire-hn";
import type { ConfirmedSubscriberWithEmail } from "@/lib/data/subscribers";
import type {
  DomainClient,
  DomainVerifyRecordStatus,
} from "@/lib/digest/domain-verify";
import type { DigestBody } from "@/lib/digest/types";
import type { BatchSender, BatchSendResult } from "@/lib/digest/sender";

function mkSnapshot(
  date: string,
  overrides: Partial<DailySnapshot> = {},
): DailySnapshot {
  return {
    date,
    capturedAt: `${date}T08:00:00Z`,
    sources: { total: 20, verified: 15, pending: 5 },
    registry: null,
    events24h: null,
    tools: [
      { id: "openai", status: "operational", activeIncidents: 0 },
      { id: "anthropic", status: "operational", activeIncidents: 0 },
    ],
    benchmarks: {
      publishDate: date,
      top3: [
        { rank: 1, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
        { rank: 2, modelName: "GPT-6", organization: "OpenAI", rating: 1490 },
        { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
      ],
    },
    packages: null,
    labs24h: [],
    failures: [],
    ...overrides,
  };
}

function mkHn(): HnWireResult {
  return {
    ok: true,
    items: [],
    points: [],
    polledAt: "2026-04-22T08:00:00Z",
    coverage: { itemsTotal: 0, itemsWithLocation: 0, geocodeResolutionPct: 0 },
    meta: { lastFetchOkTs: null, staleMinutes: null },
    source: "redis",
  };
}

function mkVerifiedDomainClient(): DomainClient {
  return {
    get: async () => ({
      data: {
        id: "dm_123",
        name: "gawk.dev",
        status: "verified",
        records: [
          { record: "SPF", status: "verified" as DomainVerifyRecordStatus },
          { record: "DKIM", status: "verified" as DomainVerifyRecordStatus },
        ],
      },
      error: null,
    }),
  };
}

function mkUnverifiedDomainClient(): DomainClient {
  return {
    get: async () => ({
      data: {
        id: "dm_123",
        name: "gawk.dev",
        status: "pending",
        records: [
          { record: "SPF", status: "pending" as DomainVerifyRecordStatus },
          { record: "DKIM", status: "pending" as DomainVerifyRecordStatus },
        ],
      },
      error: null,
    }),
  };
}

function mkSubscriber(
  hash: string,
  email: string,
  country: string | null = "GB",
): ConfirmedSubscriberWithEmail {
  return {
    emailHash: hash,
    email,
    unsubToken: `tok-${hash}`,
    geo: { country, region: null, covered: country === "GB" },
  };
}

type Capture = {
  archived: Array<{ date: string; body: DigestBody }>;
  errors: Array<{
    date: string;
    entry: { kind: string; subject: string; message: string; hash?: string };
  }>;
  bouncedHashes: string[];
  renderedFor: string[];
};

function mkBaseInput(opts: {
  batchSender: BatchSender;
  subscribers: ConfirmedSubscriberWithEmail[];
  dmarc?: "verified" | "missing" | "unreachable";
  domain?: DomainClient;
  loadSnapshot?: (d: string) => Promise<DailySnapshot | null>;
}): {
  input: Parameters<typeof sendDigestForDate>[0];
  capture: Capture;
} {
  const capture: Capture = {
    archived: [],
    errors: [],
    bouncedHashes: [],
    renderedFor: [],
  };
  const dmarcMode = opts.dmarc ?? "verified";
  return {
    capture,
    input: {
      date: "2026-04-22",
      now: new Date("2026-04-22T08:00:00Z"),
      from: "Gawk <digest@gawk.dev>",
      unsubBaseUrl: "https://gawk.dev/api/subscribe/unsubscribe",
      unsubMailto: "mailto:unsub@gawk.dev",
      baseUrl: "https://gawk.dev",
      resendDomains: opts.domain ?? mkVerifiedDomainClient(),
      resendDomainId: "dm_123",
      resendDomainName: "gawk.dev",
      dmarcResolver:
        dmarcMode === "verified"
          ? async () => [["v=DMARC1; p=reject; rua=mailto:dmarc@gawk.dev"]]
          : dmarcMode === "missing"
            ? async () => [] as string[][]
            : async () => {
                throw new Error("ENOTFOUND");
              },
      loadSnapshot:
        opts.loadSnapshot ??
        (async (d: string) => (d === "2026-04-22" ? mkSnapshot(d) : null)),
      loadHn: async () => mkHn(),
      loadIncidents24h: async () => ({ current24h: [], priorCount: 0 }),
      loadSubscribers: async () => opts.subscribers,
      batchSender: opts.batchSender,
      renderHtml: async (args) => {
        capture.renderedFor.push(args.unsubUrl);
        return `<html>${args.digest.subject} → ${args.unsubUrl}</html>`;
      },
      writeArchive: async (date, body) => {
        capture.archived.push({ date, body });
      },
      appendError: async (date, entry) => {
        capture.errors.push({ date, entry });
      },
      markBounced: async (hash) => {
        capture.bouncedHashes.push(hash);
      },
      sleepFn: async () => {},
      maxRetries: 0,
    },
  };
}

describe("buildListId", () => {
  it("composes date.domain shape", () => {
    expect(buildListId("2026-04-22", "gawk.dev")).toBe(
      "digest-2026-04-22.gawk.dev",
    );
  });
});

describe("sendDigestForDate — happy path", () => {
  it("builds, verifies, renders per-recipient, sends, archives, returns stats", async () => {
    const sendBatch = vi.fn<
      (p: ReturnType<typeof JSON.parse>) => Promise<BatchSendResult>
    >(async () => ({ ok: true, ids: ["e1", "e2"] }));
    const { input, capture } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [
        mkSubscriber("h1", "a@example.com", "GB"),
        mkSubscriber("h2", "b@example.com", null),
      ],
    });

    const result = await sendDigestForDate(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipientCount).toBe(2);
    expect(result.send.sent).toBe(2);
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(capture.archived).toHaveLength(1);
    expect(capture.archived[0].date).toBe("2026-04-22");
    expect(capture.renderedFor).toEqual([
      "https://gawk.dev/api/subscribe/unsubscribe?token=tok-h1",
      "https://gawk.dev/api/subscribe/unsubscribe?token=tok-h2",
    ]);

    const payload = sendBatch.mock.calls[0][0];
    expect(payload).toHaveLength(2);
    expect(payload[0].to).toBe("a@example.com");
    expect(payload[0].headers["List-ID"]).toBe("digest-2026-04-22.gawk.dev");
    expect(payload[0].headers["List-Unsubscribe"]).toContain("tok-h1");
    expect(payload[0].headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(payload[0].tags).toEqual(
      expect.arrayContaining([
        { name: "workflow", value: "daily-digest" },
        { name: "date", value: "2026-04-22" },
      ]),
    );
  });
});

describe("sendDigestForDate — no-snapshot abort", () => {
  it("returns {ok:false, reason:'no-snapshot'} and does not send or archive", async () => {
    const sendBatch = vi.fn(async () => ({ ok: true, ids: [] }) as BatchSendResult);
    const { input, capture } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [mkSubscriber("h1", "a@example.com")],
      loadSnapshot: async () => null,
    });

    const result = await sendDigestForDate(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-snapshot");
    expect(sendBatch).not.toHaveBeenCalled();
    expect(capture.archived).toHaveLength(0);
  });
});

describe("sendDigestForDate — domain hard-gate", () => {
  it("aborts when SPF/DKIM are pending, records error, no send, no archive", async () => {
    const sendBatch = vi.fn(async () => ({ ok: true, ids: [] }) as BatchSendResult);
    const { input, capture } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [mkSubscriber("h1", "a@example.com")],
      domain: mkUnverifiedDomainClient(),
    });

    const result = await sendDigestForDate(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("domain-not-verified");
    expect(sendBatch).not.toHaveBeenCalled();
    expect(capture.archived).toHaveLength(0);
    expect(capture.errors).toHaveLength(1);
    expect(capture.errors[0].entry.kind).toBe("domain-verify");
    expect(capture.errors[0].entry.message).toMatch(/SPF|DKIM/);
  });
});

describe("sendDigestForDate — empty subscribers", () => {
  it("runs cleanly with 0 recipients, no send call, no archive write", async () => {
    const sendBatch = vi.fn(async () => ({ ok: true, ids: [] }) as BatchSendResult);
    const { input, capture } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [],
    });

    const result = await sendDigestForDate(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipientCount).toBe(0);
    expect(result.send.sent).toBe(0);
    expect(result.send.attemptedChunks).toBe(0);
    expect(sendBatch).not.toHaveBeenCalled();
    expect(capture.archived).toHaveLength(0);
  });
});

describe("sendDigestForDate — per-recipient bounce handling", () => {
  it("fires markBounced + appendError on 4xx perEmailErrors; other recipients still count as sent", async () => {
    const sendBatch = vi.fn(
      async () =>
        ({
          ok: false,
          statusCode: 422,
          message: "permissive batch validation",
          perEmailErrors: [
            { index: 1, message: "invalid address" },
          ],
        }) as BatchSendResult,
    );
    const { input, capture } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [
        mkSubscriber("h1", "a@example.com"),
        mkSubscriber("h2", "bad@example.com"),
        mkSubscriber("h3", "c@example.com"),
      ],
    });

    const result = await sendDigestForDate(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.send.sent).toBe(2);
    expect(result.send.bounced).toEqual(["h2"]);
    expect(capture.bouncedHashes).toEqual(["h2"]);
    expect(capture.errors.some((e) => e.entry.kind === "bounce")).toBe(true);
    expect(capture.errors.some((e) => e.entry.kind === "batch-4xx")).toBe(true);
  });
});

describe("sendDigestForDate — idempotency (S62 bug fix: duplicate digest fires)", () => {
  it("short-circuits when a sent-marker exists for the date — no build, no send, no archive", async () => {
    const sendBatch = vi.fn(
      async () => ({ ok: true, ids: ["e1"] }) as BatchSendResult,
    );
    const { input, capture } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [mkSubscriber("h1", "a@example.com")],
    });
    const getSentMarker = vi.fn(async (d: string) => ({
      sentAt: "2026-04-22T08:00:00.000Z",
      recipientCount: 1,
      deliveredCount: 1,
      subject: `prior subject for ${d}`,
    }));
    const markSent = vi.fn(async () => {});

    const result = await sendDigestForDate({
      ...input,
      getSentMarker,
      markSent,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (!("skipped" in result) || !result.skipped) {
      throw new Error("expected skipped: true");
    }
    expect(result.reason).toBe("already-sent-today");
    expect(result.date).toBe("2026-04-22");
    expect(result.marker.deliveredCount).toBe(1);
    expect(getSentMarker).toHaveBeenCalledWith("2026-04-22");
    expect(sendBatch).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(capture.archived).toHaveLength(0);
    expect(capture.renderedFor).toEqual([]);
  });

  it("force=true bypasses the marker check and proceeds with the send", async () => {
    const sendBatch = vi.fn(
      async () => ({ ok: true, ids: ["e1"] }) as BatchSendResult,
    );
    const { input } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [mkSubscriber("h1", "a@example.com")],
    });
    const getSentMarker = vi.fn(async () => ({
      sentAt: "2026-04-22T08:00:00.000Z",
      recipientCount: 1,
      deliveredCount: 1,
      subject: "prior",
    }));
    const markSent = vi.fn(async () => {});

    const result = await sendDigestForDate({
      ...input,
      getSentMarker,
      markSent,
      force: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("skipped" in result && result.skipped).not.toBe(true);
    // The marker reader should be skipped entirely under force=true so a
    // failed Redis lookup can never block an operator-initiated retry.
    expect(getSentMarker).not.toHaveBeenCalled();
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(markSent).toHaveBeenCalledTimes(1);
  });

  it("writes the sent-marker after a successful send (≥1 delivered)", async () => {
    const sendBatch = vi.fn(
      async () => ({ ok: true, ids: ["e1", "e2"] }) as BatchSendResult,
    );
    const { input } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [
        mkSubscriber("h1", "a@example.com"),
        mkSubscriber("h2", "b@example.com"),
      ],
    });
    const markSent = vi.fn(async () => {});

    const result = await sendDigestForDate({
      ...input,
      // Marker reader returns null → normal send.
      getSentMarker: async () => null,
      markSent,
    });

    expect(result.ok).toBe(true);
    expect(markSent).toHaveBeenCalledTimes(1);
    const [date, marker] = markSent.mock.calls[0];
    expect(date).toBe("2026-04-22");
    expect(marker.recipientCount).toBe(2);
    expect(marker.deliveredCount).toBe(2);
    expect(marker.subject).toMatch(/Gawk/);
    expect(typeof marker.sentAt).toBe("string");
  });

  it("does NOT write the sent-marker when nothing delivered (subscribers=0)", async () => {
    const sendBatch = vi.fn(
      async () => ({ ok: true, ids: [] }) as BatchSendResult,
    );
    const { input } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [],
    });
    const markSent = vi.fn(async () => {});

    const result = await sendDigestForDate({
      ...input,
      getSentMarker: async () => null,
      markSent,
    });

    expect(result.ok).toBe(true);
    // No subscribers means the route still completes happily — but we
    // must NOT write a marker that would block tomorrow's first real
    // attempt to deliver to a freshly-confirmed subscriber.
    expect(markSent).not.toHaveBeenCalled();
  });

  it("does NOT write the sent-marker when every batch chunk failed (5xx)", async () => {
    const sendBatch = vi.fn(
      async () =>
        ({ ok: false, statusCode: 503, message: "resend down" }) as BatchSendResult,
    );
    const { input } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [mkSubscriber("h1", "a@example.com")],
    });
    const markSent = vi.fn(async () => {});

    const result = await sendDigestForDate({
      ...input,
      getSentMarker: async () => null,
      markSent,
    });

    expect(result.ok).toBe(true);
    expect(markSent).not.toHaveBeenCalled();
  });

  it("falls through to a normal send when getSentMarker is omitted (back-compat)", async () => {
    const sendBatch = vi.fn(
      async () => ({ ok: true, ids: ["e1"] }) as BatchSendResult,
    );
    const { input } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [mkSubscriber("h1", "a@example.com")],
    });
    // No getSentMarker / markSent — exercises the path many existing
    // tests use. Must continue to send normally.
    const result = await sendDigestForDate(input);
    expect(result.ok).toBe(true);
    expect(sendBatch).toHaveBeenCalledTimes(1);
  });
});

describe("sendDigestForDate — chunk 5xx without retry (maxRetries=0)", () => {
  it("records a batch-5xx error and skips archive when nothing delivered", async () => {
    const sendBatch = vi.fn(
      async () =>
        ({ ok: false, statusCode: 503, message: "resend down" }) as BatchSendResult,
    );
    const { input, capture } = mkBaseInput({
      batchSender: { sendBatch },
      subscribers: [mkSubscriber("h1", "a@example.com")],
    });

    const result = await sendDigestForDate(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.send.sent).toBe(0);
    expect(result.send.failedChunks).toBe(1);
    expect(capture.archived).toHaveLength(0);
    expect(capture.errors.some((e) => e.entry.kind === "batch-5xx")).toBe(true);
  });
});
