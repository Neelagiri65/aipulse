import { describe, expect, it, vi } from "vitest";
import {
  parseTranslateResponse,
  translateText,
} from "@/lib/i18n/translate-fetch";

// Real shape pinned from the empirical 2026-05-04 probe against
// translate.googleapis.com — the parser must keep handling exactly
// this nested-array structure or be updated alongside the endpoint.
const GERMAN_REAL_SHAPE = [
  [
    [
      "AI model unveiled with record training efficiency",
      "KI-Modell mit Rekord-Trainingseffizienz vorgestellt",
      null,
      null,
      3,
    ],
  ],
  null,
  "de",
  null,
  null,
  null,
  1,
  [],
  [["de"], null, [1], ["de"]],
];

const MULTI_SEGMENT_SHAPE = [
  [
    ["Hello. ", "Hallo. ", null, null, 1],
    ["How are you?", "Wie geht es dir?", null, null, 1],
  ],
  null,
  "de",
];

describe("parseTranslateResponse", () => {
  it("extracts the translated string + source language from the real shape", () => {
    const out = parseTranslateResponse(GERMAN_REAL_SHAPE);
    expect(out).not.toBeNull();
    expect(out?.translated).toBe(
      "AI model unveiled with record training efficiency",
    );
    expect(out?.sourceLang).toBe("de");
  });

  it("concatenates multi-segment translations in order", () => {
    const out = parseTranslateResponse(MULTI_SEGMENT_SHAPE);
    expect(out?.translated).toBe("Hello. How are you?");
    expect(out?.sourceLang).toBe("de");
  });

  it("falls back to 'auto' when source lang is missing", () => {
    const out = parseTranslateResponse([
      [["Hello", "Hola", null, null, 1]],
    ]);
    expect(out?.translated).toBe("Hello");
    expect(out?.sourceLang).toBe("auto");
  });

  it("returns null on non-array input", () => {
    expect(parseTranslateResponse(null)).toBeNull();
    expect(parseTranslateResponse({})).toBeNull();
    expect(parseTranslateResponse("oops")).toBeNull();
  });

  it("returns null on empty / malformed segments", () => {
    expect(parseTranslateResponse([])).toBeNull();
    expect(parseTranslateResponse([null])).toBeNull();
    expect(parseTranslateResponse([[]])).toBeNull();
    expect(parseTranslateResponse([[[null, null]]])).toBeNull();
  });
});

describe("translateText", () => {
  function mkFetch(
    payload: unknown,
    init: { ok?: boolean; status?: number } = {},
  ) {
    return vi.fn().mockResolvedValue({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => payload,
    } as Response);
  }

  it("returns the parsed result on a happy-path response", async () => {
    const fetchImpl = mkFetch(GERMAN_REAL_SHAPE);
    const out = await translateText("KI-Modell", { fetchImpl });
    expect(out.translated).toBe(
      "AI model unveiled with record training efficiency",
    );
    expect(out.sourceLang).toBe("de");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    expect(calledUrl).toContain("translate.googleapis.com/translate_a/single");
    expect(calledUrl).toContain("client=gtx");
    expect(calledUrl).toContain("sl=auto");
    expect(calledUrl).toContain("tl=en");
    expect(calledUrl).toContain(`q=${encodeURIComponent("KI-Modell")}`);
  });

  it("throws on non-2xx HTTP status", async () => {
    const fetchImpl = mkFetch(null, { ok: false, status: 429 });
    await expect(translateText("hi", { fetchImpl })).rejects.toThrow(/429/);
  });

  it("throws when the response shape is unrecognised", async () => {
    const fetchImpl = mkFetch({ unexpected: "shape" });
    await expect(translateText("hi", { fetchImpl })).rejects.toThrow(
      /unexpected response shape/,
    );
  });

  it("throws when called with empty text", async () => {
    await expect(translateText("")).rejects.toThrow(/empty text/);
    await expect(translateText("   ")).rejects.toThrow(/empty text/);
  });

  it("propagates AbortSignal cancellation", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      });
    const ac = new AbortController();
    const promise = translateText("hi", { fetchImpl, signal: ac.signal });
    ac.abort();
    await expect(promise).rejects.toThrow();
  });
});
