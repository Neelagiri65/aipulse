import { describe, expect, it, vi } from "vitest";
import {
  extractSenderDomain,
  sendConfirm,
  sendUnsubscribeReceipt,
  type EmailSender,
  type SendResult,
} from "@/lib/email/resend";

function mockSender(impl: (opts: { to: string; subject: string }) => SendResult): {
  sender: EmailSender;
  calls: Array<{ to: string; subject: string; from: string }>;
} {
  const calls: Array<{ to: string; subject: string; from: string }> = [];
  const sender: EmailSender = {
    async send(options) {
      calls.push({ to: options.to, subject: options.subject, from: options.from });
      return impl({ to: options.to, subject: options.subject });
    },
  };
  return { sender, calls };
}

describe("sendConfirm", () => {
  it("returns ok:true with an id on success", async () => {
    const { sender, calls } = mockSender(() => ({ ok: true, id: "msg-1" }));
    const result = await sendConfirm({
      to: "user@example.com",
      confirmUrl: "https://aipulse.dev/subscribe/confirm?token=t",
      unsubUrl: "https://aipulse.dev/subscribe/unsubscribe?token=u",
      sender,
    });
    expect(result).toEqual({ ok: true, id: "msg-1" });
    expect(calls[0].to).toBe("user@example.com");
    expect(calls[0].subject).toMatch(/confirm/i);
  });

  it("propagates 5xx errors as queued (retry-soft)", async () => {
    const { sender } = mockSender(() => ({
      ok: false,
      queued: true,
      error: "upstream 503",
    }));
    const result = await sendConfirm({
      to: "user@example.com",
      confirmUrl: "u",
      unsubUrl: "u",
      sender,
    });
    expect(result).toEqual({ ok: false, queued: true, error: "upstream 503" });
  });

  it("propagates 4xx as fatal (don't retry)", async () => {
    const { sender } = mockSender(() => ({
      ok: false,
      fatal: true,
      error: "invalid from address",
    }));
    const result = await sendConfirm({
      to: "user@example.com",
      confirmUrl: "u",
      unsubUrl: "u",
      sender,
    });
    expect(result).toEqual({
      ok: false,
      fatal: true,
      error: "invalid from address",
    });
  });

  it("returns queued:true when RESEND_API_KEY is unset and no sender injected", async () => {
    const original = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const result = await sendConfirm({
        to: "user@example.com",
        confirmUrl: "u",
        unsubUrl: "u",
      });
      expect(result).toEqual({
        ok: false,
        queued: true,
        error: "RESEND_API_KEY not configured",
      });
    } finally {
      if (original !== undefined) process.env.RESEND_API_KEY = original;
    }
  });
});

describe("sendUnsubscribeReceipt", () => {
  it("sends the unsubscribe receipt subject line", async () => {
    const { sender, calls } = mockSender(() => ({ ok: true, id: "msg-2" }));
    const result = await sendUnsubscribeReceipt({
      to: "user@example.com",
      resubscribeUrl: "https://aipulse.dev/subscribe",
      sender,
    });
    expect(result.ok).toBe(true);
    expect(calls[0].subject).toMatch(/unsubscribed/i);
  });
});

describe("extractSenderDomain", () => {
  it('parses "Name <user@domain>" form', () => {
    expect(extractSenderDomain('AI Pulse <digest@aipulse.dev>')).toBe(
      "aipulse.dev",
    );
  });

  it("parses bare address form", () => {
    expect(extractSenderDomain("digest@aipulse.dev")).toBe("aipulse.dev");
  });

  it("lowercases the result", () => {
    expect(extractSenderDomain("Digest@AIPulse.Dev")).toBe("aipulse.dev");
  });

  it("returns null on missing @", () => {
    expect(extractSenderDomain("not an email")).toBeNull();
  });

  it("returns null on trailing @", () => {
    expect(extractSenderDomain("user@")).toBeNull();
  });
});
