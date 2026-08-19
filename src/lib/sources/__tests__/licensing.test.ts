/**
 * Data-licensing invariants for the source registry.
 *
 * Gawk republishes other people's data. The repo's own MIT licence says
 * nothing about that, so every source must declare what we owe its
 * publisher — including when the honest answer is "nobody has read the
 * terms yet". These tests enforce that the declaration cannot drift into
 * a claim we haven't actually verified.
 */

import { describe, expect, it } from "vitest";

import { ALL_SOURCES } from "@/lib/data-sources";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("source data licensing", () => {
  it("declares a license block for every source", () => {
    for (const src of ALL_SOURCES) {
      expect.soft(src.license, `${src.id} has no license block`).toBeDefined();
      expect.soft(src.license?.label, `${src.id} has an empty license label`).toBeTruthy();
    }
  });

  it("never claims a verified obligation without a terms URL that was actually read", () => {
    for (const src of ALL_SOURCES) {
      if (src.license.obligation === "unverified") continue;
      expect
        .soft(src.license.termsUrl, `${src.id} claims "${src.license.obligation}" with no termsUrl`)
        .toMatch(/^https?:\/\//);
      expect
        .soft(src.license.verifiedAt, `${src.id} claims "${src.license.obligation}" with no verifiedAt`)
        .toMatch(ISO_DATE);
    }
  });

  it("marks anything with an unread terms page as unverified — no inferred licences", () => {
    // The inverse of the rule above, and the one that actually protects
    // the trust contract: an empty verifiedAt may ONLY pair with the
    // "unverified" label. Guessing a licence from a source's general
    // posture is the licensing equivalent of synthesising a data point.
    for (const src of ALL_SOURCES) {
      if (src.license.verifiedAt === "") {
        expect
          .soft(src.license.obligation, `${src.id} has no verifiedAt but claims "${src.license.obligation}"`)
          .toBe("unverified");
      }
    }
  });

  it("explains itself wherever the terms are bespoke, restrictive, or unread", () => {
    for (const src of ALL_SOURCES) {
      const needsNote =
        src.license.obligation === "see-terms" ||
        src.license.obligation === "share-alike" ||
        src.license.obligation === "unverified";
      if (!needsNote) continue;
      expect
        .soft(src.license.notes, `${src.id} is "${src.license.obligation}" but carries no notes`)
        .toBeTruthy();
    }
  });

  it("uses only known obligation labels", () => {
    const allowed = new Set(["none", "attribution", "share-alike", "see-terms", "unverified"]);
    for (const src of ALL_SOURCES) {
      expect.soft(allowed.has(src.license.obligation), `${src.id}: ${src.license.obligation}`).toBe(true);
    }
  });
});
