import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  buildAlertEmbed,
  buildRecoveryEmbed,
  postEmbeds,
} from "@/lib/notify/discord";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_URL = process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_URL === undefined) delete process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL;
  else process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL = ORIGINAL_URL;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("buildAlertEmbed", () => {
  it("uses yellow for degraded", () => {
    const e = buildAlertEmbed({
      toolDisplayName: "Cursor",
      status: "degraded",
      detail: "API latency elevated",
      sourceUrl: "https://status.cursor.com",
      sourceName: "Cursor Status",
      timestamp: "2026-04-29T12:00:00.000Z",
    }) as { color: number; title: string };
    expect(e.color).toBe(0xfacc15);
    expect(e.title).toBe("Cursor — degraded performance");
  });

  it("uses red for partial_outage", () => {
    const e = buildAlertEmbed({
      toolDisplayName: "Cursor",
      status: "partial_outage",
      detail: "",
      sourceUrl: "https://status.cursor.com",
      sourceName: "Cursor Status",
      timestamp: "2026-04-29T12:00:00.000Z",
    }) as { color: number };
    expect(e.color).toBe(0xef4444);
  });

  it("uses red for major_outage", () => {
    const e = buildAlertEmbed({
      toolDisplayName: "GitHub Copilot",
      status: "major_outage",
      detail: "",
      sourceUrl: "https://www.githubstatus.com",
      sourceName: "GitHub Status",
      timestamp: "2026-04-29T12:00:00.000Z",
    }) as { color: number };
    expect(e.color).toBe(0xef4444);
  });
});

describe("buildRecoveryEmbed", () => {
  it("uses green and references the previous status", () => {
    const e = buildRecoveryEmbed({
      toolDisplayName: "Cursor",
      previousStatus: "degraded",
      sourceUrl: "https://status.cursor.com",
      sourceName: "Cursor Status",
      timestamp: "2026-04-29T13:00:00.000Z",
    }) as { color: number; title: string; description: string };
    expect(e.color).toBe(0x10b981);
    expect(e.title).toBe("Cursor recovered");
    expect(e.description).toContain("degraded performance");
  });
});

describe("postEmbeds", () => {
  it("returns skipped when webhook URL is unset", async () => {
    delete process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL;
    const out = await postEmbeds([{ title: "x" }]);
    expect(out).toEqual({ ok: false, skipped: "no_webhook_url" });
  });

  it("returns ok with sent:0 when there are zero embeds", async () => {
    process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL = "https://discord.test/hook";
    const out = await postEmbeds([]);
    expect(out).toEqual({ ok: true, sent: 0 });
  });

  it("posts a single chunk and reports sent count", async () => {
    process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL = "https://discord.test/hook";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => "",
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const out = await postEmbeds([{ title: "a" }, { title: "b" }]);
    expect(out).toEqual({ ok: true, sent: 2 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.embeds).toHaveLength(2);
    expect(body.username).toBe("Gawk");
  });

  it("retries once on 5xx and succeeds on the second attempt", async () => {
    process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL = "https://discord.test/hook";
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "down",
      })
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const promise = postEmbeds([{ title: "a" }]);
    await vi.advanceTimersByTimeAsync(1100);
    const out = await promise;
    expect(out).toEqual({ ok: true, sent: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 4xx and surfaces the error", async () => {
    process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL = "https://discord.test/hook";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "no webhook",
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const out = await postEmbeds([{ title: "a" }]);
    expect(out.ok).toBe(false);
    if (out.ok === false && "error" in out) {
      expect(out.error).toContain("404");
      expect(out.error).toContain("no webhook");
      expect(out.status).toBe(404);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns failure with status when retry on 5xx still fails", async () => {
    process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL = "https://discord.test/hook";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const promise = postEmbeds([{ title: "a" }]);
    await vi.advanceTimersByTimeAsync(1100);
    const out = await promise;
    expect(out.ok).toBe(false);
    if (out.ok === false && "status" in out) {
      expect(out.status).toBe(502);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
