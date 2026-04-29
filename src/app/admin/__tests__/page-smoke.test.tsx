/**
 * Smoke test for /admin index. Server component depends on Redis +
 * upstream HTTP, both of which we mock at the module-import level.
 *
 * The point of this test is build-time confidence — the route renders
 * without throwing when its data sources are absent (Redis disabled, all
 * platform statuspage fetches failing). Failure paths must produce a
 * usable page, not a 500.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/data/fetch-platform-status", () => ({
  fetchAllPlatformStatus: vi.fn().mockResolvedValue({
    data: {
      vercel: {
        id: "vercel",
        sourceName: "Vercel Status",
        sourceUrl: "https://www.vercel-status.com",
        status: "operational",
        activeIncidents: [],
        lastCheckedAt: "2026-04-29T12:00:00.000Z",
      },
      supabase: {
        id: "supabase",
        sourceName: "Supabase Status",
        sourceUrl: "https://status.supabase.com",
        status: "degraded",
        activeIncidents: [
          {
            id: "i1",
            name: "Auth latency",
            status: "investigating",
            createdAt: "2026-04-29T11:00:00.000Z",
          },
        ],
        lastCheckedAt: "2026-04-29T12:00:00.000Z",
      },
    },
    polledAt: "2026-04-29T12:00:00.000Z",
    failures: [
      { id: "cloudflare", sourceId: "cloudflare-status", message: "503" },
      { id: "upstash", sourceId: "upstash-status", message: "timeout" },
    ],
  }),
}));

vi.mock("@/lib/data/cron-health", () => ({
  readAllCronHealth: vi.fn().mockResolvedValue([
    {
      workflow: "globe-ingest",
      lastSuccessAt: "2026-04-29T11:30:00.000Z",
      lastFailureAt: null,
      lastError: null,
      itemsProcessed: 12,
      errorCount: 0,
      expectedIntervalMinutes: 30,
      updatedAt: "2026-04-29T11:30:00.000Z",
    },
  ]),
  isCronStale: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/data/subscribers", () => ({
  countSubscribers: vi.fn().mockResolvedValue(3),
}));

vi.mock("@/lib/digest/archive", () => ({
  readDigestBody: vi.fn().mockResolvedValue({
    date: "2026-04-29",
    subject: "Gawk daily — 2026-04-29",
    mode: "live",
    greetingTemplate: "g",
    generatedAt: "2026-04-29T08:00:00.000Z",
    sections: [],
  }),
}));

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env.RESEND_API_KEY = "rsd_test";
  process.env.RESEND_DOMAIN_ID = "1dc77174-test";
  process.env.EMAIL_FROM_ADDRESS = "Gawk <noreply@gawk.dev>";
  delete process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL;
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
  vi.restoreAllMocks();
});

describe("/admin index page", () => {
  it("renders without throwing when every data source is healthy", async () => {
    const Mod = await import("@/app/admin/page");
    const Page = Mod.default;
    const tree = await Page();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Operator Dashboard");
    expect(html).toContain("Vercel");
    expect(html).toContain("operational");
    expect(html).toContain("Supabase");
    expect(html).toContain("degraded");
    expect(html).toContain("Auth latency");
    // The two failed sources render in their explicit "no data" state
    // rather than disappearing silently. Names render lowercase (CSS
    // capitalises visually) so assert against the rendered text.
    expect(html).toContain(">cloudflare<");
    expect(html).toContain(">upstash<");
    expect(html).toContain("no data");
    expect(html).toContain("503");
    expect(html).toContain("timeout");
    // Configuration cells reflect env state.
    expect(html).toContain("operator-pending"); // Discord webhook
    expect(html).toContain("noreply@gawk.dev");
    expect(html).toContain("Subscribers");
  });

  it("renders gracefully when Redis is unavailable", async () => {
    const cronHealth = await import("@/lib/data/cron-health");
    vi.mocked(cronHealth.readAllCronHealth).mockRejectedValueOnce(
      new Error("redis down"),
    );
    const Mod = await import("@/app/admin/page");
    const Page = Mod.default;
    const tree = await Page();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Redis unavailable");
  });
});
