import { describe, expect, it } from "vitest";
import {
  capForViewportWidth,
  togglePanelWithCap,
  type PanelState,
} from "../panel-cap";

type PanelId = "wire" | "tools" | "models" | "research";

function state(
  wire: PanelState,
  tools: PanelState,
  models: PanelState,
  research: PanelState,
): Record<PanelId, PanelState> {
  return { wire, tools, models, research };
}
const closed: PanelState = { open: false, min: false };
const visible: PanelState = { open: true, min: false };
const mini: PanelState = { open: true, min: true };

describe("capForViewportWidth", () => {
  it("returns 2 at ≥1440", () => {
    expect(capForViewportWidth(1440)).toBe(2);
    expect(capForViewportWidth(1920)).toBe(2);
  });

  it("returns 1 below 1440", () => {
    expect(capForViewportWidth(1439)).toBe(1);
    expect(capForViewportWidth(1024)).toBe(1);
    expect(capForViewportWidth(320)).toBe(1);
  });
});

describe("togglePanelWithCap", () => {
  it("closes a currently-visible panel (no cap logic on close)", () => {
    const panels = state(visible, visible, closed, closed);
    const next = togglePanelWithCap(panels, ["wire", "tools"], "wire", 1);
    expect(next.wire).toEqual(closed);
    // Tools is untouched — closing doesn't cascade.
    expect(next.tools).toEqual(visible);
  });

  it("opens a closed panel and un-minimises it", () => {
    const panels = state(closed, mini, closed, closed);
    const next = togglePanelWithCap(panels, ["tools"], "tools", 1);
    expect(next.tools).toEqual(visible);
  });

  it("cap=1: opening closes the oldest visible panel", () => {
    // zorder head = oldest focus. wire is oldest, tools is newer.
    const panels = state(visible, closed, closed, closed);
    const next = togglePanelWithCap(panels, ["wire"], "tools", 1);
    expect(next.wire).toEqual(closed);
    expect(next.tools).toEqual(visible);
  });

  it("cap=2: two visible panels allowed, third evicts oldest", () => {
    const panels = state(visible, visible, closed, closed);
    // zorder: wire opened first, then tools. Opening models should evict wire.
    const next = togglePanelWithCap(
      panels,
      ["wire", "tools"],
      "models",
      2,
    );
    expect(next.wire).toEqual(closed);
    expect(next.tools).toEqual(visible);
    expect(next.models).toEqual(visible);
  });

  it("cap=2: two visible panels stay when opening a third is actually a re-open of one of them", () => {
    // Clicking a visible panel is a close — tested above, but confirm cap doesn't evict it.
    const panels = state(visible, visible, closed, closed);
    const next = togglePanelWithCap(
      panels,
      ["wire", "tools"],
      "tools",
      2,
    );
    expect(next.tools).toEqual(closed);
    // Wire untouched — closing tools doesn't cascade into cap logic.
    expect(next.wire).toEqual(visible);
  });

  it("minimised panels don't count toward the cap", () => {
    // Wire minimised + tools visible at cap=1. Opening models should only
    // evict tools; wire stays minimised (still takes no map real estate).
    const panels = state(mini, visible, closed, closed);
    const next = togglePanelWithCap(
      panels,
      ["wire", "tools"],
      "models",
      1,
    );
    expect(next.wire).toEqual(mini);
    expect(next.tools).toEqual(closed);
    expect(next.models).toEqual(visible);
  });

  it("cap=1: opening with three currently-visible panels evicts all others", () => {
    // Unusual prior state (e.g. panels persisted from a wider viewport and
    // the user resized down). Opening anything should bring count to 1.
    const panels = state(visible, visible, visible, closed);
    const next = togglePanelWithCap(
      panels,
      ["wire", "tools", "models"],
      "research",
      1,
    );
    expect(next.wire).toEqual(closed);
    expect(next.tools).toEqual(closed);
    expect(next.models).toEqual(closed);
    expect(next.research).toEqual(visible);
  });

  it("evicts from zorder head first when reducing to cap", () => {
    // Unusual prior state: 3 visible, cap=2 (e.g. user widened the
    // viewport, or future-state). Opening a 4th requires 2 evictions
    // (visible 3 + opening 1 - cap 2 = 2 over). Oldest two from zorder
    // head go first; newest-focused panel stays alongside research.
    const panels = state(visible, visible, visible, closed);
    const next = togglePanelWithCap(
      panels,
      ["wire", "tools", "models"],
      "research",
      2,
    );
    expect(next.wire).toEqual(closed);
    expect(next.tools).toEqual(closed);
    expect(next.models).toEqual(visible);
    expect(next.research).toEqual(visible);
  });

  it("cap=2 from the clean two-visible baseline evicts only the oldest", () => {
    // Clean baseline (two visible, matching the ship-state on ≥1440
    // viewports). Opening a third evicts exactly the oldest-focused.
    const panels = state(visible, visible, closed, closed);
    const next = togglePanelWithCap(
      panels,
      ["wire", "tools"],
      "research",
      2,
    );
    expect(next.wire).toEqual(closed);
    expect(next.tools).toEqual(visible);
    expect(next.research).toEqual(visible);
  });
});
