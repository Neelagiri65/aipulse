/**
 * /digest/[date] must stay cacheable. The page once called headers() to infer
 * its origin, which silently made every archived issue a per-request render
 * with `private, no-store`. Pin both halves: the route declares ISR, and the
 * module never touches a request-scoped API again.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/digest/archive", () => ({
  listDigestDates: async () => ["2026-09-11", "2026-09-10", "2026-09-09"],
  readDigestBody: async (date: string) =>
    date === "2026-09-10"
      ? { date, subject: "gawk.dev — 2026-09-10 · 3 tool incidents", mode: "normal", generatedAt: "2026-09-10T08:00:00Z", sections: [] }
      : null,
}));

import { generateMetadata, generateStaticParams, dynamicParams, revalidate } from "@/app/digest/[date]/page";

describe("/digest/[date] render mode", () => {
  it("declares ISR with on-demand params", () => {
    expect(revalidate).toBe(3600);
    expect(dynamicParams).toBe(true);
    expect(generateStaticParams()).toEqual([]);
  });

  it("never imports a request-scoped API (headers/cookies) — that is what made it uncacheable", () => {
    const src = readFileSync(new URL("../page.tsx", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "") // doc comments may mention the old call
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/from "next\/headers"/);
    expect(src).not.toMatch(/\b(headers|cookies)\(\)/);
  });

  it("canonical points at production regardless of the serving host", async () => {
    const prev = process.env.NEXT_PUBLIC_SITE_ORIGIN;
    delete process.env.NEXT_PUBLIC_SITE_ORIGIN;
    try {
      const md = await generateMetadata({ params: Promise.resolve({ date: "2026-09-10" }) });
      expect(md.alternates?.canonical).toBe("https://gawk.dev/digest/2026-09-10");
      expect(md.title).toBe("gawk.dev — 2026-09-10 · 3 tool incidents");
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_SITE_ORIGIN = prev;
    }
  });

  it("unknown date → noindex metadata, not a fabricated issue", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ date: "2026-01-01" }) });
    expect(md.robots).toEqual({ index: false });
  });
});
