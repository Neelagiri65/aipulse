import { describe, expect, it } from "vitest";

import {
  auditItem,
  checkDeltaProvenance,
  checkFresh,
  checkNotSynthetic,
  checkResolvableSource,
} from "@/lib/trust/invariants";

const NOW = Date.parse("2026-07-05T12:00:00Z");
const H = 3_600_000;

describe("checkFresh", () => {
  it("passes within window, flags stale + missing + unparseable", () => {
    expect(checkFresh("2026-07-05T11:30:00Z", NOW, 4 * H)).toBeNull();
    expect(checkFresh("2026-07-05T06:00:00Z", NOW, 4 * H)?.invariant).toBe("fresh");
    expect(checkFresh(null, NOW, 4 * H)?.invariant).toBe("fresh");
    expect(checkFresh("not-a-date", NOW, 4 * H)?.invariant).toBe("fresh");
  });
});

describe("checkResolvableSource", () => {
  it("passes clean https, flags the #53 nested-host bug + malformed + non-https", () => {
    expect(checkResolvableSource("https://github.com/torvalds/linux")).toBeNull();
    expect(checkResolvableSource("https://gitlab.com/inkscape/inkscape")).toBeNull();
    // The exact bug: a GitLab repo linked through github.com.
    expect(
      checkResolvableSource("https://github.com/gitlab.com/gitlab-org/gitlab-runner")
        ?.invariant,
    ).toBe("attributed");
    expect(checkResolvableSource("not a url")?.invariant).toBe("attributed");
    expect(checkResolvableSource("http://example.com")?.invariant).toBe("attributed");
    expect(checkResolvableSource(undefined)?.invariant).toBe("attributed");
  });
});

describe("checkDeltaProvenance — the S91 fabrication guard", () => {
  it("a movement claim with no baseline is a fabrication", () => {
    expect(checkDeltaProvenance(true, false)?.invariant).toBe("delta-provenance");
  });
  it("movement WITH a real baseline is fine; no-movement never flags", () => {
    expect(checkDeltaProvenance(true, true)).toBeNull();
    expect(checkDeltaProvenance(false, false)).toBeNull();
  });
});

describe("checkNotSynthetic", () => {
  it("flags synthetic/simulated/sample markers", () => {
    expect(checkNotSynthetic({ simulated: true })?.invariant).toBe("real");
    expect(checkNotSynthetic({ source: "redis" })).toBeNull();
  });
});

describe("auditItem", () => {
  it("collects only the failing invariants", () => {
    const v = auditItem([
      checkFresh("2026-07-05T11:59:00Z", NOW, 4 * H), // ok
      checkResolvableSource("not a url"), // fail
      checkDeltaProvenance(true, false), // fail
    ]);
    expect(v.map((x) => x.invariant).sort()).toEqual(["attributed", "delta-provenance"]);
  });
});
