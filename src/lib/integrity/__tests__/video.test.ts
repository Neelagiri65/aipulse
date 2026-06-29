import { describe, expect, it } from "vitest";
import { evaluateVideo } from "@/lib/integrity/video";

const NOW = Date.parse("2026-06-28T12:00:00.000Z");
const DAY = 1440;

describe("evaluateVideo", () => {
  it("OK when today's video exists and resolves on YouTube", () => {
    const r = evaluateVideo({
      latest: { date: "2026-06-28", url: "https://youtu.be/APxMGkUsBM0" },
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: "Sakana: Fugu Ultra takes #1 | Gawk Daily — 28 June 2026",
    });
    expect(r.verdict).toBe("OK");
  });

  it("STALE when the last upload is too old (uploads stopped)", () => {
    const r = evaluateVideo({
      latest: { date: "2026-06-18", url: "https://youtu.be/1Y-aefaqNTU" },
      now: NOW,
      maxAgeMinutes: 2 * DAY, // 10 days old >> 2 days
      oembedTitle: "old but live",
    });
    expect(r.verdict).toBe("STALE");
  });

  it("FAIL when the entry is recent but the video does not resolve (green job, no real upload)", () => {
    const r = evaluateVideo({
      latest: { date: "2026-06-28", url: "https://youtu.be/broken" },
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: null, // oEmbed failed → not actually public
    });
    expect(r.verdict).toBe("FAIL");
  });

  it("FAIL when there are no upload-log entries at all", () => {
    const r = evaluateVideo({
      latest: null,
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: null,
    });
    expect(r.verdict).toBe("FAIL");
    expect(r.checks[0].name).toBe("exists");
  });

  it("treats an empty oEmbed title as not-live", () => {
    const r = evaluateVideo({
      latest: { date: "2026-06-28", url: "https://youtu.be/x" },
      now: NOW,
      maxAgeMinutes: 2 * DAY,
      oembedTitle: "   ",
    });
    expect(r.verdict).toBe("FAIL");
  });
});
