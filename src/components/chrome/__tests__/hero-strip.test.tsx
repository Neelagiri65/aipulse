/**
 * The hero pill is the most-cited line on the site (server-rendered, next to
 * the h1). Its count is "<operational>/<total>", so the word beside it must be
 * "operational" — never the overall state word, which read "5/6 degraded" on a
 * day with one degraded tool.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { HeroStrip } from "@/components/chrome/HeroStrip";
import type { StatusResult } from "@/lib/data/fetch-status";

function status(states: Record<string, { status: string; incidents?: number }>): StatusResult {
  const data: Record<string, unknown> = {};
  for (const [id, s] of Object.entries(states)) {
    data[id] = { status: s.status, activeIncidents: Array.from({ length: s.incidents ?? 0 }, (_, i) => ({ id: `${id}-${i}` })) };
  }
  return { data } as unknown as StatusResult;
}
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const pill = (s?: StatusResult, variant: "desktop" | "mobile" = "desktop") =>
  text(renderToStaticMarkup(<HeroStrip status={s} variant={variant} />));

describe("HeroStrip answer pill", () => {
  it("one degraded tool reads '5/6 operational · 1 degraded', never '5/6 degraded'", () => {
    const t = pill(status({ a: { status: "operational" }, b: { status: "operational" }, c: { status: "operational" }, d: { status: "operational" }, e: { status: "operational" }, f: { status: "degraded" } }));
    expect(t).toContain("5/6 operational · 1 degraded");
    expect(t).not.toContain("5/6 degraded");
  });

  it("an active incident on an 'operational' page counts as degraded, same wording", () => {
    const t = pill(status({ a: { status: "operational", incidents: 1 }, b: { status: "operational" } }));
    expect(t).toContain("1/2 operational · 1 degraded");
  });

  it("outage is itemised with colour and listed before degraded", () => {
    const html = renderToStaticMarkup(
      <HeroStrip status={status({ a: { status: "major_outage" }, b: { status: "degraded" }, c: { status: "operational" } })} />,
    );
    expect(text(html)).toContain("1/3 operational · 1 outage · 1 degraded");
    expect(html).toContain('class="ap-word ap-word--out">1 outage');
  });

  it("all operational is unchanged: '6/6 operational', coloured", () => {
    const s = status(Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((k) => [k, { status: "operational" }])));
    const html = renderToStaticMarkup(<HeroStrip status={s} />);
    expect(text(html)).toContain("6/6 operational");
    expect(text(html)).not.toContain("operational ·"); // nothing itemised after it (the sub line has its own dots)
    expect(html).toContain('ap-word ap-word--op">operational');
  });

  it("before the first poll: 'checking', no count", () => {
    expect(pill(undefined)).toMatch(/checking/);
    expect(pill(undefined)).not.toMatch(/\d\/\d/);
  });

  it("mobile variant carries the same words", () => {
    const t = pill(status({ a: { status: "operational" }, b: { status: "degraded" } }), "mobile");
    expect(t).toContain("1/2 operational · 1 degraded");
  });
});
