/**
 * The list shape and the surrogate sanitiser.
 *
 * Both exist because of one measurement: on 2026-09-18 `/api/v1/sources`
 * returned 38,451,538 bytes (10.7MB gzipped) and took 25–30s, because it
 * serialised all 31,764 registry entries with every `configs[].sample` — a
 * verbatim 500-character file quote, 58.6% of the corpus by weight. `jq`
 * could not parse the result at all: three configs on `NVIDIA/cuopt` carried
 * a lone surrogate where the 500-character cap split an emoji in half.
 */

import { describe, expect, it } from "vitest";

import {
  REGISTRY_PAGE_DEFAULT,
  REGISTRY_PAGE_MAX,
  clampPageLimit,
  sanitiseEntry,
  stripLoneSurrogates,
  toListEntry,
  type RegistryEntry,
} from "@/lib/data/registry-shared";

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    fullName: "NVIDIA/cuopt",
    owner: "NVIDIA",
    name: "cuopt",
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastActivity: "2026-09-01T00:00:00.000Z",
    stars: 1200,
    language: "C++",
    description: "GPU-accelerated optimisation",
    configs: [
      {
        kind: "agents-md",
        path: "AGENTS.md",
        sample: "# Agents\n\nfollow the workflow.",
        score: 0.8,
        verifiedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    location: { lat: 37.4, lng: -121.9, label: "Santa Clara" },
    ...overrides,
  };
}

describe("toListEntry — drops the sample and nothing else", () => {
  it("removes `sample` from every config", () => {
    const listed = toListEntry(entry());
    expect(listed.configs[0]).not.toHaveProperty("sample");
    expect(listed.configs[0]).toEqual({
      kind: "agents-md",
      path: "AGENTS.md",
      score: 0.8,
      verifiedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("keeps every other field, including the optional ones", () => {
    const full = entry();
    const listed = toListEntry(full);
    const { configs: _c, ...restOfFull } = full;
    const { configs: _l, ...restOfListed } = listed;
    // Anything dropped here is data a client silently loses.
    expect(restOfListed).toEqual(restOfFull);
  });

  it("is what makes the response small: the sample is the weight", () => {
    // A real sample is 500 characters; the rest of a config is ~60.
    const heavy = entry({
      configs: [
        {
          kind: "claude-md",
          path: "CLAUDE.md",
          sample: "x".repeat(500),
          score: 1,
          verifiedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    const fullBytes = JSON.stringify(heavy).length;
    const listedBytes = JSON.stringify(toListEntry(heavy)).length;
    expect(listedBytes).toBeLessThan(fullBytes / 2);
  });
});

describe("stripLoneSurrogates — the NVIDIA/cuopt case", () => {
  // The real payload: a 500-character sample whose last character is the high
  // half of an emoji's surrogate pair.
  const cut = "flow.\n\n> **\uD83D";

  it("removes a trailing half-emoji", () => {
    expect(stripLoneSurrogates(cut)).toBe("flow.\n\n> **");
  });

  it("makes the result parseable by a strict JSON reader", () => {
    // JSON.stringify emits a lone surrogate as \ud83d — valid for JS,
    // rejected by jq. Well-formed stringify (ES2019) escapes it, so the
    // check that matters is that no unpaired surrogate survives.
    const cleaned = stripLoneSurrogates(cut);
    expect(/[\uD800-\uDFFF]/.test(cleaned)).toBe(false);
  });

  it("leaves a COMPLETE emoji alone — this is not an emoji filter", () => {
    const whole = "ship it 🚀 now";
    expect(stripLoneSurrogates(whole)).toBe(whole);
  });

  it("removes an orphaned low surrogate too", () => {
    expect(stripLoneSurrogates("\uDE80tail")).toBe("tail");
  });

  it("is a no-op on ordinary text", () => {
    expect(stripLoneSurrogates("# CLAUDE.md\n\nrules")).toBe(
      "# CLAUDE.md\n\nrules",
    );
  });
});

describe("sanitiseEntry", () => {
  it("cleans every config's sample and preserves the rest", () => {
    const dirty = entry({
      configs: [
        {
          kind: "agents-md",
          path: "AGENTS.md",
          sample: "a\uD83D",
          score: 0.8,
          verifiedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          kind: "cursorrules",
          path: ".cursorrules",
          sample: "b\uDE00",
          score: 0.5,
          verifiedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    const clean = sanitiseEntry(dirty);
    expect(clean.configs.map((c) => c.sample)).toEqual(["a", "b"]);
    expect(clean.fullName).toBe("NVIDIA/cuopt");
    expect(clean.configs[1].score).toBe(0.5);
  });
});

describe("clampPageLimit", () => {
  it("defaults when the param is absent or junk", () => {
    for (const raw of [null, undefined, "", "abc", "NaN"]) {
      expect(clampPageLimit(raw)).toBe(REGISTRY_PAGE_DEFAULT);
    }
  });

  it("defaults rather than erroring on zero and negatives", () => {
    expect(clampPageLimit("0")).toBe(REGISTRY_PAGE_DEFAULT);
    expect(clampPageLimit("-5")).toBe(REGISTRY_PAGE_DEFAULT);
  });

  it("caps at the maximum — a caller cannot ask for the whole corpus again", () => {
    expect(clampPageLimit("999999")).toBe(REGISTRY_PAGE_MAX);
    expect(clampPageLimit(String(REGISTRY_PAGE_MAX + 1))).toBe(
      REGISTRY_PAGE_MAX,
    );
  });

  it("honours a sane value and floors a fractional one", () => {
    expect(clampPageLimit("250")).toBe(250);
    expect(clampPageLimit("10.9")).toBe(10);
  });
});
