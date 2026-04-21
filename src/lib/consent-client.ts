/**
 * consent-client — pure logic for the consent banner + preferences UI.
 *
 * Keeping decisions (should we show the banner? has the user already
 * answered? how do we reconcile server + cookie state?) in plain
 * functions means we can unit-test them without rendering React.
 * The client component (ConsentBanner.tsx) is a thin wiring layer.
 */

import type { ConsentCategories } from "@/lib/data/consent";

export type BannerInputs = {
  /** Is the visitor in a jurisdiction where we must prompt for
   *  consent (EU27 / EEA / UK / California)? Non-covered visitors
   *  never see the banner — analytics are on by default there. */
  covered: boolean;
  /** Does the browser send `Sec-GPC: 1`? If so the user has already
   *  refused analytics+marketing at the browser level; we honour it
   *  silently without a banner. */
  gpc: boolean;
  /** Has the user already interacted with the banner this device? Tracked
   *  via the aip_consent cookie — presence = "answered". */
  hasInteracted: boolean;
};

export function shouldShowBanner(input: BannerInputs): boolean {
  if (!input.covered) return false;
  if (input.gpc) return false;
  if (input.hasInteracted) return false;
  return true;
}

export type ConsentMode = "default-deny" | "gpc-locked" | "granted" | "revoked";

export function deriveConsentMode(
  categories: ConsentCategories | null,
  gpc: boolean,
): ConsentMode {
  if (gpc) return "gpc-locked";
  if (!categories) return "default-deny";
  if (categories.analytics || categories.marketing) return "granted";
  return "revoked";
}

/**
 * Normalise the API response into a shape the UI can display. The
 * server never returns nulls for categories (defaults to default-deny),
 * but we defend in depth in case a future route shape regresses.
 */
export function normaliseCategories(
  input: Partial<ConsentCategories> | null | undefined,
): ConsentCategories {
  return {
    necessary: true,
    analytics: Boolean(input?.analytics),
    marketing: Boolean(input?.marketing),
  };
}

export type BannerChoice = "accept-all" | "reject-all" | "customise";

export function choiceToCategories(
  choice: Exclude<BannerChoice, "customise">,
): ConsentCategories {
  if (choice === "accept-all") {
    return { necessary: true, analytics: true, marketing: true };
  }
  return { necessary: true, analytics: false, marketing: false };
}
