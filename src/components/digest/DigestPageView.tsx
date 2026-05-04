/**
 * Public-page renderer for a `DigestBody`.
 *
 * Mirrors the email template's section layout so subscribers who clicked
 * "View on Gawk" in the email see the same content with a bit more
 * breathing room + interactive share buttons. Server component —
 * SectionShareButton is the only client island.
 */

import { SectionShareButton } from "@/components/digest/SectionShareButton";
import type {
  DigestBody,
  DigestSection,
  DigestSectionItem,
} from "@/lib/digest/types";
import { deriveTranslateUrl, TRANSLATE_LABEL } from "@/lib/i18n/translate-link";
import { whyThisMatters } from "@/lib/digest/why-this-matters";

export type DigestPageViewProps = {
  digest: DigestBody;
  /** Origin for the page's canonical + share links. No trailing slash. */
  baseUrl: string;
};

export function DigestPageView({
  digest,
  baseUrl,
}: DigestPageViewProps): React.JSX.Element {
  const permalink = `${baseUrl}/digest/${digest.date}`;
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <header className="mb-10 border-b border-border/60 pb-6">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
          Gawk · {digest.date}
        </p>
        <h1 className="mb-3 font-mono text-2xl tracking-tight">
          {digest.subject}
        </h1>
        <p className="text-sm text-muted-foreground">
          {digest.mode === "bootstrap"
            ? "First-day snapshot — where things stand now. Diff mode resumes tomorrow once we have two days to compare."
            : digest.mode === "quiet"
              ? "Nothing meaningful moved in the AI ecosystem in the last 24h. Baseline metrics unchanged."
              : "Five verifiable things that moved in the AI ecosystem in the last 24h. Every number traces to a public source."}
        </p>
      </header>

      {digest.inferences && digest.inferences.length > 0 ? (
        <section
          data-testid="digest-inferences"
          className="mb-8 rounded-lg border border-border/60 bg-card/40 px-5 py-4"
        >
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            What moved
          </p>
          <ul className="space-y-1.5">
            {digest.inferences.map((line, i) => (
              <li key={i} className="text-sm text-foreground/95">
                · {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.sections.map((section) => (
        <DigestSectionView
          key={section.id}
          section={section}
          permalink={permalink}
          baseUrl={baseUrl}
          date={digest.date}
        />
      ))}

      <footer className="mt-16 border-t border-border/60 pt-6 text-[12px] text-muted-foreground">
        <p>
          Archived from{" "}
          <time dateTime={digest.generatedAt}>
            {new Date(digest.generatedAt).toUTCString()}
          </time>
          . Every number traces to a public source.
        </p>
      </footer>
    </main>
  );
}

function DigestSectionView({
  section,
  permalink,
  baseUrl,
  date,
}: {
  section: DigestSection;
  permalink: string;
  baseUrl: string;
  date: string;
}): React.JSX.Element {
  const sectionUrl = `${permalink}#${section.anchorSlug}`;
  return (
    <section
      id={section.anchorSlug}
      className="mb-12 scroll-mt-12"
      data-testid={`digest-section-${section.id}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-primary">
          {section.title}
        </h2>
        <a
          href={`#${section.anchorSlug}`}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
          aria-label={`Anchor link to ${section.title}`}
        >
          #
        </a>
      </div>

      <p className="mb-2 text-base font-semibold">{section.headline}</p>
      <p
        className="mb-4 rounded border-l-2 border-primary/45 bg-primary/[0.04] px-3 py-2 text-[12px] leading-snug text-muted-foreground"
        data-testid={`digest-why-this-matters-${section.id}`}
      >
        <span className="font-semibold tracking-wide text-primary">
          Why this matters ·{" "}
        </span>
        {whyThisMatters(section.id)}
      </p>

      {section.id === "tool-health" ? (
        <img
          src={`${baseUrl}/api/digest/chart/tool-health/${date}`}
          alt={`Tool health, 7 days ending ${date}. Each row is one tool; each column is one UTC day. Green = operational, amber = degraded, red = outage, grey = no data.`}
          width={720}
          height={320}
          className="mb-4 block w-full max-w-[720px] rounded border border-primary/20"
          data-testid="digest-tool-health-chart"
        />
      ) : null}

      {section.items.length > 0 ? (
        <ul className="mb-4 space-y-3">
          {section.items.map((item, i) => (
            <DigestItemView key={i} item={item} baseUrl={baseUrl} />
          ))}
        </ul>
      ) : null}

      {section.sourceUrls.length > 0 ? (
        <p className="mb-3 text-[12px] text-muted-foreground">
          Source:{" "}
          {section.sourceUrls.map((u, i) => (
            <span key={u}>
              <a
                href={u}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {displaySource(u)}
              </a>
              {i < section.sourceUrls.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={sectionUrl}
          className="rounded border border-primary/60 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary hover:bg-primary/20"
        >
          Anchor link
        </a>
        <SectionShareButton
          sectionId={section.id}
          sectionTitle={section.title}
          headline={section.headline}
          permalink={sectionUrl}
        />
      </div>
    </section>
  );
}

function DigestItemView({
  item,
  baseUrl,
}: {
  item: DigestSectionItem;
  baseUrl: string;
}): React.JSX.Element {
  return (
    <li className="border-l-2 border-border pl-3">
      <p className="text-sm">{item.headline}</p>
      {item.detail ? (
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {item.detail}
        </p>
      ) : null}
      {item.sourceUrl ? (
        <p className="mt-0.5 text-[11px]">
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 text-primary/80 hover:text-primary"
          >
            {item.sourceLabel ?? displaySource(item.sourceUrl)}
          </a>
          {(() => {
            const tx = deriveTranslateUrl(item.sourceUrl, item.sourceLang);
            if (!tx) return null;
            return (
              <>
                {" · "}
                <a
                  href={tx}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2 text-primary/80 hover:text-primary"
                  data-testid="translate-link"
                >
                  {TRANSLATE_LABEL}
                </a>
              </>
            );
          })()}
          {item.panelHref ? (
            <>
              {" · "}
              <a
                href={`${baseUrl}${item.panelHref}`}
                className="underline underline-offset-2 text-primary/80 hover:text-primary"
              >
                View on Gawk →
              </a>
            </>
          ) : null}
        </p>
      ) : item.panelHref ? (
        <p className="mt-0.5 text-[11px]">
          <a
            href={`${baseUrl}${item.panelHref}`}
            className="underline underline-offset-2 text-primary/80 hover:text-primary"
          >
            View on Gawk →
          </a>
        </p>
      ) : null}
      {item.caveat ? (
        <p className="mt-0.5 text-[11px] italic text-muted-foreground">
          {item.caveat}
        </p>
      ) : null}
    </li>
  );
}

function displaySource(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
