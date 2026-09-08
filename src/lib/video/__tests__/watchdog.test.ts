/**
 * Video watchdog decision — pins the 2026-08-27/28 incident: GitHub
 * dropped the scheduled event for `daily-video` and for BOTH slots of
 * the Actions watchdog, so the retry never fired and the day's video
 * was only recovered by hand. This decision now runs off a Vercel cron.
 *
 * The branch that matters most is the unhappy one: a log we could not
 * read must NOT be treated as a missing video.
 */
import { describe, expect, it } from "vitest";

import { decideWatchdog, utcDay } from "@/lib/video/watchdog";

const TODAY = "2026-08-28";

describe("decideWatchdog", () => {
  it("today already in the log → no dispatch", () => {
    const d = decideWatchdog({
      log: [{ date: "2026-08-27" }, { date: TODAY }],
      today: TODAY,
    });
    expect(d.action).toBe("none");
    expect(d.latestDate).toBe(TODAY);
  });

  it("THE INCIDENT: yesterday present, today absent → dispatch", () => {
    const d = decideWatchdog({
      log: [{ date: "2026-08-26" }, { date: "2026-08-27" }],
      today: TODAY,
    });
    expect(d.action).toBe("dispatch");
    expect(d.reason).toContain("2026-08-27");
  });

  it("empty log → dispatch, and says so rather than reporting a latest date", () => {
    const d = decideWatchdog({ log: [], today: TODAY });
    expect(d.action).toBe("dispatch");
    expect(d.latestDate).toBeNull();
    expect(d.reason).toContain("empty");
  });

  it("unreadable log → error, NEVER a dispatch", () => {
    const d = decideWatchdog({ log: null, today: TODAY });
    expect(d.action).toBe("error");
  });

  it("log that parsed to a non-array → error, NEVER a dispatch", () => {
    const d = decideWatchdog({
      log: { date: TODAY } as unknown as { date?: unknown }[],
      today: TODAY,
    });
    expect(d.action).toBe("error");
  });

  it("ignores entries without a usable date instead of throwing", () => {
    const d = decideWatchdog({
      log: [{ date: 20260828 }, {}, { date: "2026-08-27" }],
      today: TODAY,
    });
    expect(d.action).toBe("dispatch");
    expect(d.latestDate).toBe("2026-08-27");
  });

  it("finds today even when the log is not in date order", () => {
    const d = decideWatchdog({
      log: [{ date: TODAY }, { date: "2026-08-20" }],
      today: TODAY,
    });
    expect(d.action).toBe("none");
    expect(d.latestDate).toBe(TODAY);
  });
});

describe("utcDay", () => {
  it("is UTC, not local — a late-evening UK timestamp is still the same UTC day", () => {
    expect(utcDay(Date.parse("2026-08-28T23:30:00Z"))).toBe("2026-08-28");
  });

  it("rolls over at UTC midnight", () => {
    expect(utcDay(Date.parse("2026-08-29T00:00:01Z"))).toBe("2026-08-29");
  });
});
