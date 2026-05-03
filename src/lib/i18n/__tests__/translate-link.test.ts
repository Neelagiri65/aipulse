import { describe, expect, it } from "vitest";
import { deriveTranslateUrl, TRANSLATE_LABEL } from "@/lib/i18n/translate-link";

describe("deriveTranslateUrl", () => {
  it("returns null when lang is 'en'", () => {
    expect(
      deriveTranslateUrl("https://example.com/article", "en"),
    ).toBeNull();
  });

  it("returns null when lang is undefined / null / empty", () => {
    expect(deriveTranslateUrl("https://example.com/article", undefined)).toBeNull();
    expect(deriveTranslateUrl("https://example.com/article", null)).toBeNull();
    expect(deriveTranslateUrl("https://example.com/article", "")).toBeNull();
  });

  it("returns null when lang is a regional English variant (en-GB, en-us)", () => {
    expect(deriveTranslateUrl("https://example.com/", "en-GB")).toBeNull();
    expect(deriveTranslateUrl("https://example.com/", "en-us")).toBeNull();
  });

  it("returns null when sourceUrl is missing or not a parseable URL", () => {
    expect(deriveTranslateUrl(null, "de")).toBeNull();
    expect(deriveTranslateUrl(undefined, "de")).toBeNull();
    expect(deriveTranslateUrl("", "de")).toBeNull();
    expect(deriveTranslateUrl("not a url", "de")).toBeNull();
  });

  it("returns null for non-http(s) protocols (mailto, javascript)", () => {
    expect(deriveTranslateUrl("mailto:test@example.com", "de")).toBeNull();
    // eslint-disable-next-line no-script-url
    expect(deriveTranslateUrl("javascript:alert(1)", "de")).toBeNull();
  });

  it("emits a Google Translate URL with sl=auto, tl=en, and url-encoded source", () => {
    const url = deriveTranslateUrl(
      "https://www.heise.de/news/test?id=42",
      "de",
    );
    expect(url).toContain("translate.google.com/translate");
    expect(url).toContain("sl=auto");
    expect(url).toContain("tl=en");
    expect(url).toContain(
      encodeURIComponent("https://www.heise.de/news/test?id=42"),
    );
  });

  it("handles Chinese and Japanese language tags", () => {
    expect(
      deriveTranslateUrl("https://example.cn/", "zh"),
    ).toContain("translate.google.com");
    expect(
      deriveTranslateUrl("https://example.jp/", "ja"),
    ).toContain("translate.google.com");
  });

  it("normalises lang case so 'DE' and 'En' both behave correctly", () => {
    expect(deriveTranslateUrl("https://example.com/", "DE")).toContain(
      "translate.google.com",
    );
    expect(
      deriveTranslateUrl("https://example.com/", "En"),
    ).toBeNull();
  });

  it("the pill label is a single source of truth", () => {
    expect(TRANSLATE_LABEL).toBeTruthy();
    expect(TRANSLATE_LABEL.length).toBeLessThan(20);
  });
});
