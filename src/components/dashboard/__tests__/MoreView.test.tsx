import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MoreView, WIRE_HREF } from "@/components/dashboard/MoreView";
import type { NavItem } from "@/components/chrome/nav-items";

const items: NavItem[] = [
  { id: "wire", label: "Wire", icon: "wire", count: 1703 },
  { id: "tools", label: "Tools", icon: "tools", count: 6 },
  { id: "benchmarks", label: "Benchmarks", icon: "benchmarks", count: 20 },
  { id: "audit", label: "Audit", icon: "audit", soon: true },
] as NavItem[];

describe("MoreView", () => {
  it("every board row is a real link to its deep link; the Wire goes to Feed › Wire; soon rows are inert", () => {
    const html = renderToStaticMarkup(<MoreView items={items} currentBoard="tools" onOpenBoard={() => {}} onOpenWire={() => {}} />);
    expect(html).toContain(`href="${WIRE_HREF.replace("&", "&amp;")}"`);
    expect(html).toContain('href="/?tab=more&amp;board=tools"');
    expect(html).toContain('href="/?tab=more&amp;board=benchmarks"');
    expect(html).toMatch(/ap-list-row ap-list-row--on"[^>]*aria-current="page"/);
    expect(html).toContain("ap-list-row--soon");
    expect(html).not.toContain('href="/?tab=more&amp;board=audit"');
    expect(html).toContain("1,703");
  });
});
