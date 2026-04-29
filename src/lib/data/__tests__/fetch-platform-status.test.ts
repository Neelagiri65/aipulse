import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllPlatformStatus } from "@/lib/data/fetch-platform-status";

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function makeStatuspagePayload(
  indicator: "none" | "minor" | "major" | "critical",
  incidents: Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
  }> = [],
): unknown {
  return {
    page: { id: "x", name: "Test", url: "https://example.com" },
    status: { indicator, description: "" },
    components: [{ id: "c1", name: "API", status: "operational" }],
    incidents,
  };
}

function mockJson(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

describe("fetchAllPlatformStatus", () => {
  beforeEach(() => {
    // Default: every fetch returns operational + no incidents
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockJson(makeStatuspagePayload("none"))) as unknown as typeof fetch;
  });

  it("returns one entry per platform when all are healthy", async () => {
    const result = await fetchAllPlatformStatus();
    expect(Object.keys(result.data).sort()).toEqual([
      "cloudflare",
      "supabase",
      "upstash",
      "vercel",
    ]);
    expect(result.failures).toEqual([]);
    for (const id of ["vercel", "supabase", "cloudflare", "upstash"] as const) {
      expect(result.data[id]?.status).toBe("operational");
      expect(result.data[id]?.activeIncidents).toEqual([]);
    }
  });

  it("maps minor indicator to degraded", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockJson(makeStatuspagePayload("minor"))) as unknown as typeof fetch;
    const result = await fetchAllPlatformStatus();
    expect(result.data.vercel?.status).toBe("degraded");
  });

  it("maps major indicator to partial_outage", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockJson(makeStatuspagePayload("major"))) as unknown as typeof fetch;
    const result = await fetchAllPlatformStatus();
    expect(result.data.cloudflare?.status).toBe("partial_outage");
  });

  it("maps critical indicator to major_outage", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockJson(makeStatuspagePayload("critical"))) as unknown as typeof fetch;
    const result = await fetchAllPlatformStatus();
    expect(result.data.supabase?.status).toBe("major_outage");
  });

  it("filters incidents to active states only", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockJson(
        makeStatuspagePayload("minor", [
          {
            id: "i1",
            name: "Active issue",
            status: "investigating",
            created_at: "2026-04-29T10:00:00Z",
          },
          {
            id: "i2",
            name: "Old issue",
            status: "resolved",
            created_at: "2026-04-28T10:00:00Z",
          },
          {
            id: "i3",
            name: "Postmortem only",
            status: "postmortem",
            created_at: "2026-04-27T10:00:00Z",
          },
        ]),
      ),
    ) as unknown as typeof fetch;
    const result = await fetchAllPlatformStatus();
    expect(result.data.vercel?.activeIncidents).toHaveLength(1);
    expect(result.data.vercel?.activeIncidents[0].name).toBe("Active issue");
  });

  it("reports per-source failures and continues with the rest", async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call += 1;
      // First call (vercel) fails, the other three succeed.
      if (call === 1) {
        return {
          ok: false,
          status: 503,
          json: async () => ({}),
        } as unknown as Response;
      }
      return mockJson(makeStatuspagePayload("none"));
    }) as unknown as typeof fetch;

    const result = await fetchAllPlatformStatus();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].id).toBe("vercel");
    expect(Object.keys(result.data)).toHaveLength(3);
    expect(result.data.vercel).toBeUndefined();
  });
});
