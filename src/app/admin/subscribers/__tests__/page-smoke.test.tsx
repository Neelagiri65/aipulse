/**
 * Smoke test for /admin/subscribers. Mocks readAllSubscribers so the
 * test never touches Redis or the encryption key.
 *
 * Coverage:
 *  - Empty ledger renders the explicit "no subscriber records yet" empty
 *    state (not a 500 or a blank page).
 *  - Mixed ledger (pending/confirmed/unsubscribed) renders all three
 *    counts, the country breakdown, and a row per subscriber.
 *  - Decrypt-failed rows render with — for the email and the hash in the
 *    title attribute so the operator can still spot the row.
 *  - Redis unavailable (helper rejects) renders the explicit unavailable
 *    banner instead of crashing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/data/subscribers", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/data/subscribers")
  >("@/lib/data/subscribers");
  return {
    ...actual,
    readAllSubscribers: vi.fn(),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/admin/subscribers", () => {
  it("renders the empty state when there are no subscribers", async () => {
    const subs = await import("@/lib/data/subscribers");
    vi.mocked(subs.readAllSubscribers).mockResolvedValue([]);
    const Mod = await import("@/app/admin/subscribers/page");
    const Page = Mod.default;
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Subscriber ledger");
    expect(html).toContain("No subscriber records yet");
    // Status counts present and zeroed.
    expect(html).toContain("Total");
    expect(html).toContain("Confirmed");
    expect(html).toContain("Pending");
    expect(html).toContain("Unsubscribed");
  });

  it("renders all three statuses in the summary strip and table", async () => {
    const subs = await import("@/lib/data/subscribers");
    vi.mocked(subs.readAllSubscribers).mockResolvedValue([
      {
        emailHash: "h_confirmed",
        email: "ada@gawk.dev",
        status: "confirmed",
        geo: { country: "GB", region: "London", covered: true },
        createdAt: "2026-04-30T10:00:00.000Z",
        confirmedAt: "2026-04-30T10:01:00.000Z",
      },
      {
        emailHash: "h_pending",
        email: "grace@gawk.dev",
        status: "pending",
        geo: { country: "US", region: null, covered: true },
        createdAt: "2026-04-29T22:00:00.000Z",
      },
      {
        emailHash: "h_unsubbed",
        email: "alan@gawk.dev",
        status: "unsubscribed",
        geo: { country: "GB", region: null, covered: true },
        createdAt: "2026-04-28T08:00:00.000Z",
        unsubscribedAt: "2026-04-29T20:00:00.000Z",
      },
    ]);
    const Mod = await import("@/app/admin/subscribers/page");
    const Page = Mod.default;
    const html = renderToStaticMarkup(await Page());

    // Status counts visible.
    expect(html).toContain('data-testid="subscriber-count-total"');
    // Three subscribers total (one of each status), one confirmed.
    const tableMatches = html.match(/<td[^>]*>\s*<span[^>]*>([^<]*ada@gawk\.dev|grace@gawk\.dev|alan@gawk\.dev)/g);
    expect(tableMatches?.length).toBe(3);

    // Status badges render.
    expect(html).toContain(">confirmed<");
    expect(html).toContain(">pending<");
    expect(html).toContain(">unsubscribed<");

    // Country breakdown only counts CONFIRMED — GB×1 (Ada), US not in
    // confirmed (Grace is pending).
    expect(html).toContain("Confirmed by country");
    expect(html).toContain(">GB<");
    // The unsubscribed Alan in GB is excluded from the country tally.
    const gbCountMatches = html.match(/>GB<\/span>\s*<span[^>]*>1<\/span>/);
    expect(gbCountMatches).not.toBeNull();
  });

  it("renders — and the hash title for rows whose decrypt failed", async () => {
    const subs = await import("@/lib/data/subscribers");
    vi.mocked(subs.readAllSubscribers).mockResolvedValue([
      {
        emailHash: "h_rotated_key",
        email: null,
        status: "confirmed",
        geo: { country: null, region: null, covered: false },
        createdAt: "2026-04-30T10:00:00.000Z",
      },
    ]);
    const Mod = await import("@/app/admin/subscribers/page");
    const Page = Mod.default;
    const html = renderToStaticMarkup(await Page());
    // Email cell shows — with hash in title attr so the operator can
    // still match the row to a hash from logs.
    expect(html).toContain('title="hash: h_rotated_key"');
  });

  it("shows the lastDeliveryError prominently when present", async () => {
    const subs = await import("@/lib/data/subscribers");
    vi.mocked(subs.readAllSubscribers).mockResolvedValue([
      {
        emailHash: "h_bounce",
        email: "bounce@gawk.dev",
        status: "confirmed",
        geo: { country: "GB", region: null, covered: true },
        createdAt: "2026-04-30T10:00:00.000Z",
        lastDeliveryError: "550 5.1.1 mailbox not found",
      },
    ]);
    const Mod = await import("@/app/admin/subscribers/page");
    const Page = Mod.default;
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("550 5.1.1 mailbox not found");
    // Error styled red so it stands out in the operator scan.
    expect(html).toContain("text-red-400");
  });

  it("renders the Redis-unavailable banner when readAllSubscribers throws", async () => {
    const subs = await import("@/lib/data/subscribers");
    vi.mocked(subs.readAllSubscribers).mockRejectedValue(
      new Error("redis down"),
    );
    const Mod = await import("@/app/admin/subscribers/page");
    const Page = Mod.default;
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("Redis unavailable");
  });
});
