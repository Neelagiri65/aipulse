import { describe, expect, it, vi } from "vitest";
import { isTrackingAllowed, track } from "@/lib/analytics";
import type { TrackingContext } from "@/lib/analytics";

describe("isTrackingAllowed", () => {
  const defaults: TrackingContext = {
    covered: false,
    gpc: false,
    categories: null,
  };

  it("allows tracking for non-covered visitors by default", () => {
    expect(isTrackingAllowed(defaults)).toBe(true);
  });

  it("blocks tracking for non-covered visitors if Sec-GPC is set", () => {
    expect(isTrackingAllowed({ ...defaults, gpc: true })).toBe(false);
  });

  it("blocks tracking for covered visitors with no consent recorded", () => {
    expect(isTrackingAllowed({ ...defaults, covered: true })).toBe(false);
  });

  it("blocks tracking for covered visitors who revoked analytics", () => {
    expect(
      isTrackingAllowed({
        covered: true,
        gpc: false,
        categories: {
          necessary: true,
          analytics: false,
          marketing: false,
        },
      }),
    ).toBe(false);
  });

  it("allows tracking for covered visitors who granted analytics", () => {
    expect(
      isTrackingAllowed({
        covered: true,
        gpc: false,
        categories: {
          necessary: true,
          analytics: true,
          marketing: false,
        },
      }),
    ).toBe(true);
  });

  it("always blocks when Sec-GPC is set, even if the user granted analytics", () => {
    // GPC is legally binding in CA; we treat it as an absolute no even
    // when it contradicts a subsequent click on "accept all".
    expect(
      isTrackingAllowed({
        covered: true,
        gpc: true,
        categories: {
          necessary: true,
          analytics: true,
          marketing: true,
        },
      }),
    ).toBe(false);
  });
});

describe("track", () => {
  it("short-circuits with reason=ssr when no DOM is present", () => {
    const dispatch = vi.fn();
    const out = track(
      "panel_open",
      { panel: "wire" },
      { dispatch, contextResolver: () => null },
    );
    expect(out).toEqual({ fired: false, reason: "ssr" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("short-circuits with reason=gpc when Sec-GPC is set", () => {
    const dispatch = vi.fn();
    const out = track(
      "panel_open",
      { panel: "wire" },
      {
        dispatch,
        contextResolver: () => ({
          covered: false,
          gpc: true,
          categories: null,
        }),
      },
    );
    expect(out).toEqual({ fired: false, reason: "gpc" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("short-circuits with reason=no-consent for covered visitors without consent", () => {
    const dispatch = vi.fn();
    const out = track(
      "panel_open",
      { panel: "tools" },
      {
        dispatch,
        contextResolver: () => ({
          covered: true,
          gpc: false,
          categories: null,
        }),
      },
    );
    expect(out).toEqual({ fired: false, reason: "no-consent" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches when allowed and passes props through", () => {
    const dispatch = vi.fn();
    const out = track(
      "subscribe_submit",
      { outcome: "sent", variant: "compact" },
      {
        dispatch,
        contextResolver: () => ({
          covered: false,
          gpc: false,
          categories: null,
        }),
      },
    );
    expect(out).toEqual({ fired: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("subscribe_submit", {
      outcome: "sent",
      variant: "compact",
    });
  });

  it("dispatches share_click with a method prop", () => {
    const dispatch = vi.fn();
    const out = track(
      "share_click",
      { method: "clipboard" },
      {
        dispatch,
        contextResolver: () => ({
          covered: true,
          gpc: false,
          categories: {
            necessary: true,
            analytics: true,
            marketing: false,
          },
        }),
      },
    );
    expect(out).toEqual({ fired: true });
    expect(dispatch).toHaveBeenCalledWith("share_click", {
      method: "clipboard",
    });
  });

  it("does not mutate the caller's props object", () => {
    const dispatch = vi.fn();
    const props = { panel: "wire" };
    track("panel_open", props, {
      dispatch,
      contextResolver: () => ({
        covered: false,
        gpc: false,
        categories: null,
      }),
    });
    expect(props).toEqual({ panel: "wire" });
  });
});
