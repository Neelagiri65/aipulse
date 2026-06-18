import { describe, expect, it } from "vitest";
import { deriveAuditFindingCards } from "@/lib/feed/derivers/audit-finding";
import type { AuditsResult } from "@/lib/data/fetch-audits";

const AT = "2026-06-19T00:00:00.000Z";

describe("deriveAuditFindingCards", () => {
  it("returns [] when the fetch failed (graceful, never fabricated)", () => {
    const r: AuditsResult = { ok: false, findings: [], generatedAt: AT };
    expect(deriveAuditFindingCards(r)).toEqual([]);
  });

  it("emits a cited AUDIT_FINDING card with a deterministic claimed-vs-measured headline", () => {
    const r: AuditsResult = {
      ok: true,
      generatedAt: AT,
      findings: [
        {
          id: "qwen25vl-mmstar",
          status: "inflated",
          model: "Qwen2.5-VL-7B",
          benchmark: "MMStar",
          claimed: 63.9,
          measured: 51.8,
          date: AT,
          reportUrl: "https://nativerse-ventures.com/audits/qwen25vl-mmstar",
        },
      ],
    };
    const cards = deriveAuditFindingCards(r);
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe("AUDIT_FINDING");
    expect(cards[0].sourceName).toBe("Nativerse Claims Audit");
    expect(cards[0].sourceUrl).toBe(
      "https://nativerse-ventures.com/audits/qwen25vl-mmstar",
    );
    expect(cards[0].headline).toContain("claimed 63.9");
    expect(cards[0].headline).toContain("measured 51.8");
  });

  it("skips entries missing an id or a source URL", () => {
    const r: AuditsResult = {
      ok: true,
      generatedAt: AT,
      findings: [
        { id: "", status: "holds", model: "x", benchmark: "y", claimed: null, measured: null, date: AT, reportUrl: "" },
      ],
    };
    expect(deriveAuditFindingCards(r)).toEqual([]);
  });
});
