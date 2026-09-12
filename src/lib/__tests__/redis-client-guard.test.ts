/**
 * Every Upstash client goes through createRedis(). A bare `new Redis(...)`
 * anywhere else brings back the client's `cache: "no-store"` default, which
 * makes any route that reads through it dynamic regardless of `revalidate`.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

const ctor = vi.fn();
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(cfg: unknown) {
      ctor(cfg);
    }
  },
}));

import { createRedis } from "@/lib/redis-client";

describe("redis-client", () => {
  it("constructs with cache: 'default'", () => {
    createRedis("https://x.upstash.io", "t");
    expect(ctor).toHaveBeenCalledWith({ url: "https://x.upstash.io", token: "t", cache: "default" });
  });

  it("is the only place `new Redis(` appears in src (outside tests)", () => {
    let out = "";
    try {
      out = execFileSync("grep", ["-rlE", "new Redis\\(", "src", "--include=*.ts", "--include=*.tsx"], { encoding: "utf8" });
    } catch (e) {
      // grep exits 1 when nothing matches — impossible here since the factory itself matches
      out = (e as { stdout?: string }).stdout ?? "";
    }
    const offenders = out.split("\n").filter(Boolean).filter((f) => !f.includes("__tests__") && f !== "src/lib/redis-client.ts");
    expect(offenders).toEqual([]);
  });
});
