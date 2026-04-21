import { describe, expect, it } from "vitest";
import { deriveSev } from "@/components/chrome/StatusBar";
import type { StatusResult } from "@/lib/data/fetch-status";
import type { ToolHealthData } from "@/components/health/tools";

function mkTool(
  status: ToolHealthData["status"],
  incidents: number = 0,
): ToolHealthData {
  return {
    status,
    statusSourceId: "x",
    lastCheckedAt: "2026-04-21T00:00:00Z",
    activeIncidents: Array.from({ length: incidents }, (_, i) => ({
      id: `i${i}`,
      name: "",
      status: "investigating",
      createdAt: "2026-04-21T00:00:00Z",
    })),
  };
}

function mkStatus(
  tools: Record<string, ToolHealthData>,
): StatusResult {
  return {
    polledAt: "2026-04-21T00:00:00Z",
    failures: [],
    data: tools as StatusResult["data"],
  };
}

describe("deriveSev", () => {
  it("returns zero counts when status is undefined", () => {
    expect(deriveSev(undefined)).toEqual({
      operational: 0,
      degraded: 0,
      outage: 0,
      unknown: 0,
      total: 0,
    });
  });

  it("counts plain operational tools", () => {
    const sev = deriveSev(
      mkStatus({
        a: mkTool("operational"),
        b: mkTool("operational"),
      }),
    );
    expect(sev).toMatchObject({
      operational: 2,
      degraded: 0,
      outage: 0,
      total: 2,
    });
  });

  it("folds operational+active-incident into degraded (trust invariant)", () => {
    const sev = deriveSev(
      mkStatus({
        a: mkTool("operational"),
        b: mkTool("operational", 1),
      }),
    );
    expect(sev).toMatchObject({
      operational: 1,
      degraded: 1,
      outage: 0,
      total: 2,
    });
  });

  it("counts partial and major outages under outage bucket", () => {
    const sev = deriveSev(
      mkStatus({
        a: mkTool("partial_outage"),
        b: mkTool("major_outage"),
        c: mkTool("operational"),
      }),
    );
    expect(sev).toMatchObject({
      operational: 1,
      degraded: 0,
      outage: 2,
      total: 3,
    });
  });

  it("bundles explicit degraded tools with operational+incident fold", () => {
    const sev = deriveSev(
      mkStatus({
        a: mkTool("degraded"),
        b: mkTool("operational", 2),
        c: mkTool("operational"),
      }),
    );
    expect(sev.degraded).toBe(2);
    expect(sev.operational).toBe(1);
  });

  it("counts unknown status separately", () => {
    const sev = deriveSev(mkStatus({ a: mkTool("unknown") }));
    expect(sev.unknown).toBe(1);
    expect(sev.operational).toBe(0);
    expect(sev.total).toBe(1);
  });
});
