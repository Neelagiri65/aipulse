"use client";

/**
 * TranslatableText (S61) — inline translate-toggle for non-English text.
 *
 * Wraps a piece of text + (optional) source link with a tiny "🌐 Translate"
 * button. On click, fetches the translation client-side from Google's
 * translate_a/single endpoint and replaces the text in-place. Click
 * again ("🌐 Original") to revert. Translation is cached in component
 * state so repeat toggles don't re-fetch.
 *
 * Trust contract:
 *   - When showing translated text, render a "via Google Translate"
 *     attribution next to the text. The reader must know the
 *     translation is third-party, not Gawk-authored.
 *   - On any failure (fetch error, parse error, AbortError that isn't
 *     a navigation), surface a "translation failed" badge + a fallback
 *     link to the legacy Google Translate redirect URL. The original
 *     text remains visible — no silent dead state.
 *   - English content (lang === "en" / "en-*" / null / undefined)
 *     renders as a plain text/link with no toggle button — keeps the
 *     per-row UI quiet for the 80%+ of items that don't need translation.
 *
 * Composition:
 *   - When `linkUrl` is provided, the text becomes an external anchor
 *     and the toggle button is rendered as a SIBLING of the anchor.
 *     This avoids nesting a button inside an anchor (would conflate
 *     click semantics) and lets the existing flex layouts at the call
 *     site keep working unchanged.
 */

import { useCallback, useState } from "react";

import { translateText } from "@/lib/i18n/translate-fetch";
import { deriveTranslateUrl, TRANSLATE_LABEL } from "@/lib/i18n/translate-link";

export type TranslatableTextProps = {
  /** The text to display + optionally translate. */
  text: string;
  /** BCP-47 short tag of the source language. Translation is offered
   *  only when this is non-English (not "en", not "en-*"). Null /
   *  undefined / empty disables the toggle. */
  lang: string | null | undefined;
  /** When provided, the text is rendered inside an `<a target="_blank">`
   *  pointing here. This is the original article URL, NOT the translated
   *  page — clicking the title always opens the source. */
  linkUrl?: string;
  /** className applied to the visible text element (anchor or span). */
  textClassName?: string;
  /** className applied to the toggle button + attribution row. */
  controlClassName?: string;
  /** Override for the HTML title (tooltip). Defaults to the original
   *  text so hovering always reveals the source-language version. */
  hoverTitle?: string;
  /** Test seam: inject a fake translateText for unit tests. */
  translateImpl?: typeof translateText;
};

type State = "original" | "loading" | "translated" | "failed";

export function TranslatableText({
  text,
  lang,
  linkUrl,
  textClassName,
  controlClassName,
  hoverTitle,
  translateImpl,
}: TranslatableTextProps): React.JSX.Element {
  const eligible = isTranslatable(lang);
  const [state, setState] = useState<State>("original");
  const [translated, setTranslated] = useState<string | null>(null);

  const fetcher = translateImpl ?? translateText;

  const handleToggle = useCallback(
    async (e: React.MouseEvent) => {
      // Defensive: stop bubbling so clicking the toggle never triggers
      // a parent navigation. The button is rendered outside the anchor
      // already, but if a future call site nests differently this
      // guard keeps the semantics intact.
      e.preventDefault();
      e.stopPropagation();
      if (state === "translated") {
        setState("original");
        return;
      }
      if (state === "loading") return;
      if (translated) {
        // Cached from a previous click — no re-fetch needed.
        setState("translated");
        return;
      }
      setState("loading");
      try {
        const result = await fetcher(text);
        setTranslated(result.translated);
        setState("translated");
      } catch {
        setState("failed");
      }
    },
    [state, text, translated, fetcher],
  );

  const display = state === "translated" && translated ? translated : text;
  const tooltip = hoverTitle ?? text;

  return (
    <>
      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={textClassName}
          title={tooltip}
          data-testid="translatable-text"
        >
          {display}
        </a>
      ) : (
        <span
          className={textClassName}
          title={tooltip}
          data-testid="translatable-text"
        >
          {display}
        </span>
      )}
      {eligible ? (
        <ToggleControl
          state={state}
          fallbackUrl={linkUrl}
          lang={lang ?? null}
          controlClassName={controlClassName}
          onToggle={handleToggle}
        />
      ) : null}
    </>
  );
}

function ToggleControl({
  state,
  fallbackUrl,
  lang,
  controlClassName,
  onToggle,
}: {
  state: State;
  fallbackUrl: string | undefined;
  lang: string | null;
  controlClassName?: string;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const baseBtn =
    controlClassName ??
    "shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70 hover:text-[#f97316] hover:underline";

  if (state === "loading") {
    return (
      <span
        className={baseBtn}
        data-testid="translate-loading"
        aria-live="polite"
      >
        Translating…
      </span>
    );
  }

  if (state === "translated") {
    return (
      <>
        <button
          type="button"
          onClick={onToggle}
          className={baseBtn}
          data-testid="translate-toggle"
          aria-label="Show original language"
        >
          🌐 Original
        </button>
        <span
          className="shrink-0 font-mono text-[8px] uppercase tracking-wider text-muted-foreground/50"
          data-testid="translate-attribution"
        >
          via Google Translate
        </span>
      </>
    );
  }

  if (state === "failed") {
    const fallbackTranslateUrl = fallbackUrl
      ? deriveTranslateUrl(fallbackUrl, lang)
      : null;
    return (
      <>
        <span
          className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-amber-400/80"
          data-testid="translate-failed"
        >
          translation failed
        </span>
        {fallbackTranslateUrl ? (
          <a
            href={fallbackTranslateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={baseBtn}
            data-testid="translate-fallback-link"
          >
            read translated externally ↗
          </a>
        ) : null}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={baseBtn}
      data-testid="translate-toggle"
      aria-label="Translate to English"
    >
      {TRANSLATE_LABEL}
    </button>
  );
}

function isTranslatable(lang: string | null | undefined): boolean {
  if (!lang) return false;
  const n = lang.toLowerCase().trim();
  if (n === "" || n === "en" || n.startsWith("en-")) return false;
  return true;
}
