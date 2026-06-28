import { describe, expect, it } from "vitest";
import {
  buildBatchItem,
  buildBatchPayload,
  chunkForBatch,
  sanitizeHeaderValue,
  type DigestRecipient,
} from "@/lib/digest/batch";

function r(i: number): DigestRecipient {
  return {
    emailHash: `h${i}`,
    email: `u${i}@x.com`,
    unsubToken: `tok-${i}`,
    geo: { country: "GB", region: null, covered: true },
  };
}

const OPTS = {
  from: "Gawk <digest@gawk.dev>",
  subject: "Gawk — 2026-04-22",
  unsubBaseUrl: "https://gawk.dev/api/subscribe/unsubscribe",
  unsubMailto: "mailto:unsub@gawk.dev",
  listId: "digest-2026-04-22.gawk.dev",
  renderHtml: (rec: DigestRecipient) => `<p>Hello ${rec.email}</p>`,
};

describe("chunkForBatch", () => {
  it("returns [] for empty input", () => {
    expect(chunkForBatch([])).toEqual([]);
  });

  it("returns a single chunk when N <= size", () => {
    expect(chunkForBatch([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  it("splits into exact chunks when N % size === 0", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i);
    expect(chunkForBatch(xs, 50)).toHaveLength(2);
  });

  it("splits into chunks with a remainder", () => {
    const xs = Array.from({ length: 101 }, (_, i) => i);
    const chunks = chunkForBatch(xs, 100);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(1);
  });

  it("defaults to size 100", () => {
    const xs = Array.from({ length: 250 }, (_, i) => i);
    expect(chunkForBatch(xs)).toHaveLength(3);
  });

  it("rejects invalid chunk sizes", () => {
    expect(chunkForBatch([1, 2, 3], 0)).toEqual([]);
    expect(chunkForBatch([1, 2, 3], -5)).toEqual([]);
  });
});

describe("buildBatchItem", () => {
  it("emits RFC-8058 List-Unsubscribe + One-Click headers", () => {
    const item = buildBatchItem(r(1), OPTS);
    expect(item.headers["List-Unsubscribe"]).toBe(
      "<https://gawk.dev/api/subscribe/unsubscribe?token=tok-1>, <mailto:unsub@gawk.dev>",
    );
    expect(item.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(item.headers["List-ID"]).toBe("digest-2026-04-22.gawk.dev");
  });

  it("URL-encodes the unsub token", () => {
    const item = buildBatchItem(
      { ...r(1), unsubToken: "a+b/c=d" },
      OPTS,
    );
    expect(item.headers["List-Unsubscribe"]).toContain(
      "token=a%2Bb%2Fc%3Dd",
    );
  });

  it("passes from/to/subject through and renders per-recipient html", () => {
    const item = buildBatchItem(r(1), OPTS);
    expect(item.from).toBe(OPTS.from);
    expect(item.to).toBe("u1@x.com");
    expect(item.subject).toBe(OPTS.subject);
    expect(item.html).toContain("u1@x.com");
  });

  // Regression: NEXT_PUBLIC_SITE_ORIGIN was saved on Vercel with a
  // trailing newline. After interpolation into the unsub URL the newline
  // became *internal* ("https://gawk.dev\n/api/subscribe/unsubscribe"),
  // so the List-Unsubscribe header carried a \n and Resend rejected the
  // entire batch ("Header keys and values cannot contain carriage return,
  // line feed, or null characters") — the digest sent 0 emails for ~10
  // days. The chokepoint must strip CR/LF/null wherever they appear.
  it("strips CR/LF/null from header values built from a dirty origin", () => {
    const item = buildBatchItem(r(1), {
      ...OPTS,
      unsubBaseUrl: "https://gawk.dev\n/api/subscribe/unsubscribe",
    });
    const unsub = item.headers["List-Unsubscribe"];
    expect(unsub).not.toMatch(/[\r\n\u0000]/);
    expect(unsub).toBe(
      "<https://gawk.dev/api/subscribe/unsubscribe?token=tok-1>, <mailto:unsub@gawk.dev>",
    );
  });

  it("strips CR/LF/null from from/to/subject (header-injection guard)", () => {
    const item = buildBatchItem(
      { ...r(1), email: "u1@x.com\r\nBcc: evil@x.com" },
      {
        ...OPTS,
        from: "Gawk <digest@gawk.dev>\n",
        subject: "Gawk — 2026-04-22\r\nX-Injected: 1",
      },
    );
    expect(item.from).toBe("Gawk <digest@gawk.dev>");
    expect(item.to).toBe("u1@x.comBcc: evil@x.com");
    expect(item.subject).toBe("Gawk — 2026-04-22X-Injected: 1");
    for (const v of [item.from, item.to, item.subject]) {
      expect(v).not.toMatch(/[\r\n\u0000]/);
    }
  });

  it("leaves clean values (incl. spaces) untouched", () => {
    expect(sanitizeHeaderValue("Gawk <digest@gawk.dev>")).toBe(
      "Gawk <digest@gawk.dev>",
    );
    expect(sanitizeHeaderValue("Gawk — 2026-04-22 · 1 tool incident")).toBe(
      "Gawk — 2026-04-22 · 1 tool incident",
    );
  });

  it("carries tags when provided", () => {
    const item = buildBatchItem(r(1), {
      ...OPTS,
      tags: [{ name: "campaign", value: "daily" }],
    });
    expect(item.tags).toEqual([{ name: "campaign", value: "daily" }]);
  });
});

describe("buildBatchPayload", () => {
  it("maps each recipient to a batch item in order", () => {
    const payload = buildBatchPayload([r(1), r(2), r(3)], OPTS);
    expect(payload.map((i) => i.to)).toEqual([
      "u1@x.com",
      "u2@x.com",
      "u3@x.com",
    ]);
  });

  it("returns an empty array for zero recipients", () => {
    expect(buildBatchPayload([], OPTS)).toEqual([]);
  });
});
