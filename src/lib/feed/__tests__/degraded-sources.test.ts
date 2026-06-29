import { describe, expect, it } from "vitest";

import {
  deriveDegradedSources,
  OPENROUTER_SOURCE_NAME,
} from "@/lib/feed/degraded-sources";
import type { ModelUsageRow } from "@/lib/data/openrouter-types";

// A single row is enough — the helper keys off ordering + row presence,
// not row contents.
const row = { rank: 1, slug: "anthropic/claude" } as unknown as ModelUsageRow;

describe("deriveDegradedSources", () => {
  it("flags OpenRouter when on catalogue-fallback WITH rows", () => {
    const out = deriveDegradedSources({
      models: { ordering: "catalogue-fallback", rows: [row] },
    });
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe(OPENROUTER_SOURCE_NAME);
    expect(out[0].reason).toMatch(/degraded/i);
  });

  it("does NOT flag catalogue-fallback with ZERO rows (cold start / no data)", () => {
    const out = deriveDegradedSources({
      models: { ordering: "catalogue-fallback", rows: [] },
    });
    expect(out).toEqual([]);
  });

  it("does NOT flag a healthy top-weekly ordering", () => {
    const out = deriveDegradedSources({
      models: { ordering: "top-weekly", rows: [row] },
    });
    expect(out).toEqual([]);
  });

  it("does NOT flag a healthy trending ordering", () => {
    const out = deriveDegradedSources({
      models: { ordering: "trending", rows: [row] },
    });
    expect(out).toEqual([]);
  });
});
