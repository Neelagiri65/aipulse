/**
 * One subject: the two UTC formatters every user-visible absolute time is
 * meant to go through.
 *
 * `dateUtc` exists because the Model Usage drawer printed OpenRouter's
 * `knowledge_cutoff` raw — `2026-02-16T00:00:00.000Z` on screen, wrapped over
 * two lines, milliseconds and all. The values are dates wearing instants:
 * some arrive at start-of-day, some at end-of-day, and both mean the same
 * kind of thing.
 */
import { describe, expect, it } from "vitest";

import { dateUtc, stampUtc } from "@/lib/format/utc-stamp";

describe("stampUtc", () => {
  it("renders dd/mm/yyyy hh:mm UTC", () => {
    expect(stampUtc("2026-09-18T06:22:50.000Z")).toBe("18/09/2026 06:22 UTC");
  });

  it("echoes input it cannot parse rather than printing Invalid Date", () => {
    expect(stampUtc("not a time")).toBe("not a time");
  });
});

describe("dateUtc", () => {
  it("renders dd/mm/yyyy, dropping the instant", () => {
    expect(dateUtc("2026-02-16T00:00:00.000Z")).toBe("16/02/2026");
  });

  it("does not roll an end-of-day instant into the next day", () => {
    // The live values: a cutoff at 23:59:59Z is that day, not the next one.
    // Reading these in local time would move both.
    expect(dateUtc("2025-01-31T23:59:59.000Z")).toBe("31/01/2025");
    expect(dateUtc("2024-06-30T23:59:59.000Z")).toBe("30/06/2024");
  });

  it("echoes input it cannot parse", () => {
    expect(dateUtc("not a date")).toBe("not a date");
  });

  it("agrees with stampUtc on the date half", () => {
    const iso = "2026-09-18T06:22:50.000Z";
    expect(stampUtc(iso).startsWith(dateUtc(iso))).toBe(true);
  });
});

describe("the header clock shares the house date order", () => {
  it("puts the day first, not the month", async () => {
    const { fmtUtc } = await import("@/components/chrome/TopBar");
    // The live render that exposed this said "09/18/2026 19:58:28 UTC" in the
    // chrome while the panels below it said "18/09/2026 16:42 UTC".
    expect(fmtUtc(new Date("2026-09-18T19:58:28.000Z"))).toBe("18/09/2026 19:58:28 UTC");
  });

  it("agrees with dateUtc on the date half", () => {
    const d = new Date("2026-01-02T03:04:05.000Z");
    expect(dateUtc(d.toISOString())).toBe("02/01/2026");
  });
});
