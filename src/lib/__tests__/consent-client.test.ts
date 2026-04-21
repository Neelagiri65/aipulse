import { describe, expect, it } from "vitest";
import {
  choiceToCategories,
  deriveConsentMode,
  normaliseCategories,
  shouldShowBanner,
} from "@/lib/consent-client";

describe("shouldShowBanner", () => {
  it("returns false for non-covered jurisdictions", () => {
    expect(
      shouldShowBanner({ covered: false, gpc: false, hasInteracted: false }),
    ).toBe(false);
  });

  it("returns false when Sec-GPC is set even for covered jurisdictions", () => {
    expect(
      shouldShowBanner({ covered: true, gpc: true, hasInteracted: false }),
    ).toBe(false);
  });

  it("returns false when the user has already answered", () => {
    expect(
      shouldShowBanner({ covered: true, gpc: false, hasInteracted: true }),
    ).toBe(false);
  });

  it("returns true for a fresh visit from a covered jurisdiction with no GPC", () => {
    expect(
      shouldShowBanner({ covered: true, gpc: false, hasInteracted: false }),
    ).toBe(true);
  });
});

describe("deriveConsentMode", () => {
  it("returns gpc-locked when Sec-GPC is set regardless of categories", () => {
    expect(
      deriveConsentMode(
        { necessary: true, analytics: true, marketing: false },
        true,
      ),
    ).toBe("gpc-locked");
  });

  it("returns default-deny when there is no stored state", () => {
    expect(deriveConsentMode(null, false)).toBe("default-deny");
  });

  it("returns granted when either category is true", () => {
    expect(
      deriveConsentMode(
        { necessary: true, analytics: true, marketing: false },
        false,
      ),
    ).toBe("granted");
  });

  it("returns revoked when both categories are false in a stored record", () => {
    expect(
      deriveConsentMode(
        { necessary: true, analytics: false, marketing: false },
        false,
      ),
    ).toBe("revoked");
  });
});

describe("normaliseCategories", () => {
  it("forces necessary to true and coerces truthy/falsy to booleans", () => {
    expect(
      normaliseCategories({ analytics: 1 as unknown as boolean, marketing: 0 as unknown as boolean }),
    ).toEqual({ necessary: true, analytics: true, marketing: false });
  });

  it("treats null/undefined as default-deny", () => {
    expect(normaliseCategories(null)).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
    expect(normaliseCategories(undefined)).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });
});

describe("choiceToCategories", () => {
  it("accept-all turns both flags on", () => {
    expect(choiceToCategories("accept-all")).toEqual({
      necessary: true,
      analytics: true,
      marketing: true,
    });
  });

  it("reject-all turns both flags off", () => {
    expect(choiceToCategories("reject-all")).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });
});
