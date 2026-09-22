/**
 * The iOS app's App Store identity. One place, so the More tab, the digest
 * footer and the Smart App Banner cannot drift apart.
 *
 * gawk.dev 1.0 (bundle `dev.gawk.ios`, App Store id 6810342350) went live on
 * 2026-09-22 in 121 territories; the 27 EU storefronts follow once Apple's
 * Digital Services Act trader review completes.
 *
 * The URL carries no storefront on purpose: Apple redirects `/app/…` to the
 * visitor's own storefront, so a UK reader lands on `/gb/` and a US reader on
 * `/us/` without us guessing.
 */

export const APP_STORE_ID = "6810342350";
export const APP_STORE_URL = `https://apps.apple.com/app/gawk-dev/id${APP_STORE_ID}`;
