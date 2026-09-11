import { describe, expect, it, vi } from "vitest";
import { DAY_TONE_WORD, dayMark, dayTone, deriveRowState } from "@/components/health/row-state";
import { bucketToDays } from "@/lib/data/status-history";
import type { StatusSample } from "@/lib/data/status-history";
import { TOOLS, type ToolHealthData } from "@/components/health/tools";
import type { DayBucket } from "@/lib/data/status-history";

const codex = TOOLS.find((t) => t.id === "codex")!;
const verified = TOOLS.filter((t) => !t.noPublicSource);

function live(overrides: Partial<ToolHealthData> = {}): ToolHealthData {
  return { status: "operational", statusSourceId: "openai-status", lastCheckedAt: "2026-09-05T12:00:00Z", ...overrides };
}

describe("deriveRowState — state by shape, colour by words", () => {
  it("operational with no open incident is the only solid mark and is not an exception", () => {
    const s = deriveRowState(codex, live());
    expect(s).toMatchObject({ mode: "live", mark: "solid", word: "operational", tone: "op", exception: false });
  });

  it("operational with an open incident keeps the vendor's word but hatches the mark (#63 posture)", () => {
    const s = deriveRowState(codex, live({ activeIncidents: [{ id: "i", name: "x", status: "investigating", createdAt: "2026-09-05T11:00:00Z" }] }));
    expect(s).toMatchObject({ mark: "hatched", word: "operational", tone: "op", exception: true, activeIncidents: 1 });
  });

  it("degraded and partial outage are hatched; only outage words carry the red tone", () => {
    expect(deriveRowState(codex, live({ status: "degraded" }))).toMatchObject({ mark: "hatched", word: "degraded", tone: "ink", exception: true });
    expect(deriveRowState(codex, live({ status: "partial_outage" }))).toMatchObject({ mark: "hatched", word: "partial outage", tone: "out" });
    expect(deriveRowState(codex, live({ status: "major_outage" }))).toMatchObject({ mark: "hatched", word: "major outage", tone: "out" });
  });

  it("unknown status, no data yet and no public source are hollow and never claim anything", () => {
    expect(deriveRowState(codex, live({ status: "unknown" }))).toMatchObject({ mark: "hollow", word: "unknown", tone: "ink" });
    expect(deriveRowState(codex, undefined)).toMatchObject({ mode: "awaiting", mark: "hollow", word: "awaiting first poll" });
    const noSource = { ...codex, noPublicSource: true };
    expect(deriveRowState(noSource, undefined)).toMatchObject({ mode: "no-data", mark: "hollow", word: "no public source" });
  });

  it("every configured tool with a public source resolves to a live mode when data is present", () => {
    for (const t of verified) expect(deriveRowState(t, live()).mode).toBe("live");
  });
});

function day(overrides: Partial<DayBucket>): DayBucket {
  return { date: "2026-09-01", worstStatus: "unknown", worstImpact: "none" as DayBucket["worstImpact"], incidents: [], sampleCount: 0, ...overrides };
}

describe("dayTone / dayMark — the 7-day strip never claims uptime it did not measure", () => {
  it("incident impact is authoritative", () => {
    expect(dayMark(dayTone(day({ worstImpact: "critical" as DayBucket["worstImpact"], worstStatus: "operational", sampleCount: 5 }), true))).toBe("hatched");
    expect(dayTone(day({ worstImpact: "minor" as DayBucket["worstImpact"] }), false)).toBe("degrade");
  });
  it("polled operational day is solid; a day with no incident and no sample is hollow unless the history has samples", () => {
    expect(dayMark(dayTone(day({ worstStatus: "operational", sampleCount: 3 }), true))).toBe("solid");
    expect(dayMark(dayTone(day({}), false))).toBe("hollow");
    expect(dayMark(dayTone(day({}), true))).toBe("solid");
  });
});

describe("dayTone — a polled day we could not read is not a clean day", () => {
  it("samples present but every one unreadable reports 'not measured', hollow", () => {
    const b = day({ worstStatus: "unknown", sampleCount: 288 });
    expect(dayTone(b, true)).toBe("unknown");
    expect(dayMark(dayTone(b, true))).toBe("hollow");
    expect(DAY_TONE_WORD[dayTone(b, true)]).toBe("not measured");
  });

  it("the zero-sample fallback is untouched — that is its own open question", () => {
    // A day nobody polled, in a history that has samples elsewhere, still claims operational.
    // Deliberately unchanged by the S119 fix; see HANDOFF.
    expect(dayTone(day({ worstStatus: "unknown", sampleCount: 0 }), true)).toBe("op");
  });

  it("end to end: real samples through bucketToDays reach the strip with the right tone", () => {
    const now = Date.UTC(2026, 8, 10, 12, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    try {
      const at = (h: number) => new Date(now - h * 3600_000).toISOString();
      const pick = (samples: StatusSample[]) => {
        const buckets = bucketToDays([], samples, 7);
        const b = buckets.find((x) => x.date === "2026-09-10")!;
        return dayMark(dayTone(b, buckets.some((x) => x.sampleCount > 0)));
      };
      const healthy: StatusSample[] = [1, 2, 3].map((h) => ({ ts: at(h), status: "operational", activeIncidents: 0 }));
      const unreadable: StatusSample[] = [1, 2, 3].map((h) => ({ ts: at(h), status: "unknown", activeIncidents: 0 }));
      expect(pick(healthy)).toBe("solid");
      expect(pick(unreadable)).toBe("hollow");
    } finally {
      vi.useRealTimers();
    }
  });
});
