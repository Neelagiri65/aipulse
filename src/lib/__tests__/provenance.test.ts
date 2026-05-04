import { describe, expect, it } from "vitest";
import {
  formatProvenanceTooltip,
  formatRelativeAgo,
} from "@/lib/provenance";

const NOW_MS = Date.UTC(2026, 4, 4, 1, 0, 0); // 2026-05-04T01:00:00Z

describe("formatRelativeAgo", () => {
  it("renders sub-minute ages in seconds", () => {
    const t = new Date(NOW_MS - 23_000).toISOString();
    expect(formatRelativeAgo(t, NOW_MS)).toBe("23s ago");
  });

  it("renders sub-hour ages in minutes", () => {
    const t = new Date(NOW_MS - 12 * 60_000).toISOString();
    expect(formatRelativeAgo(t, NOW_MS)).toBe("12m ago");
  });

  it("renders sub-day ages in hours", () => {
    const t = new Date(NOW_MS - 5 * 60 * 60_000).toISOString();
    expect(formatRelativeAgo(t, NOW_MS)).toBe("5h ago");
  });

  it("renders multi-day ages in days", () => {
    const t = new Date(NOW_MS - 3 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeAgo(t, NOW_MS)).toBe("3d ago");
  });

  it('returns "just now" for future timestamps (clock skew guard)', () => {
    const t = new Date(NOW_MS + 60_000).toISOString();
    expect(formatRelativeAgo(t, NOW_MS)).toBe("just now");
  });

  it('returns "—" for unparseable input', () => {
    expect(formatRelativeAgo("not-a-date", NOW_MS)).toBe("—");
  });
});

describe("formatProvenanceTooltip", () => {
  it("composes the verified-ago + source-url tooltip line", () => {
    const t = new Date(NOW_MS - 45_000).toISOString();
    expect(
      formatProvenanceTooltip(t, "https://openrouter.ai/rankings", NOW_MS),
    ).toBe("Last verified 45s ago via https://openrouter.ai/rankings");
  });

  it("preserves the source URL verbatim (no truncation)", () => {
    const t = new Date(NOW_MS - 60_000).toISOString();
    const long = "https://api.example.com/v1/very/deep/path?with=query&and=stuff";
    expect(formatProvenanceTooltip(t, long, NOW_MS)).toContain(long);
  });
});
