/**
 * The archive's Redis client must not use fetch `cache: "no-store"`. Next
 * treats that as a dynamic-rendering opt-out for the whole route, which
 * silently turned every archive page's ISR into a per-request render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctor = vi.fn();
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(cfg: unknown) {
      ctor(cfg);
    }
  },
}));

import { __resetDigestArchiveClientCache, isDigestArchiveAvailable } from "@/lib/digest/archive";

describe("digest archive Redis client", () => {
  const env = { ...process.env };
  beforeEach(() => {
    ctor.mockReset();
    __resetDigestArchiveClientCache();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  });
  afterEach(() => {
    process.env = { ...env };
    __resetDigestArchiveClientCache();
  });

  it("is constructed with cache: 'default', never the no-store default", () => {
    expect(isDigestArchiveAvailable()).toBe(true);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor.mock.calls[0][0]).toMatchObject({ cache: "default" });
    expect(ctor.mock.calls[0][0]).not.toMatchObject({ cache: "no-store" });
  });
});
