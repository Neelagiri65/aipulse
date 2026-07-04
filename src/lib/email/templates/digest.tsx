/**
 * Daily-digest email template — Direction A, "Editorial Data-Journalism"
 * (design decision 2026-07-05, research-digest-redesign-2026-07-05).
 *
 * Layout: dark masthead band → "What moved" hero card → one bordered card
 * per section (uppercase kicker, headline, why-this-matters line, items
 * with semantic delta colouring + monospace figures) → ONE footer CTA
 * block with the digest's share links. The per-section button/share spam
 * of the previous design is gone; each section keeps a small anchor
 * deep-link ("View on Gawk →") in its source row.
 *
 * Colour strategy (verified 3-0, Litmus): an always-dark email gets
 * FORCE-INVERTED by Gmail iOS / Outlook Windows, so the base design is
 * LIGHT, with an explicit dark palette via `prefers-color-scheme` +
 * `[data-ogsc]` class overrides and `color-scheme` meta tags. Semantic
 * colours encode data direction only: green = gain, red = loss, amber =
 * incident — chosen for WCAG AA on both palettes.
 *
 * Trust contract unchanged: every number renders verbatim from the
 * composed DigestBody; `deltaDirection` only picks a colour, it never
 * rewrites copy. Every item keeps its per-item source link; every section
 * keeps its source row.
 *
 * The template is a pure React component — no fetch, no env reads.
 * `renderDigestHtml` turns it into the string passed to Resend.
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/components";
import type {
  DigestBody,
  DigestSection,
  DigestSectionItem,
} from "@/lib/digest/types";
import { deltaDirection, type DeltaDirection } from "@/lib/email/delta";
import { renderGreeting } from "@/lib/email/greeting";
import { buildShareUrl, composeShareText } from "@/lib/email/share-urls";
import { deriveTranslateUrl, TRANSLATE_LABEL } from "@/lib/i18n/translate-link";
import { whyThisMatters } from "@/lib/digest/why-this-matters";

/** Tool-health 7-day chart embedded in the email and the public web
 *  digest. URL is content-addressed by date so mail clients edge-cache
 *  the same image across recipients of the same send. */
const TOOL_HEALTH_CHART_W = 720;
const TOOL_HEALTH_CHART_H = 320;
function toolHealthChartUrl(baseUrl: string, date: string): string {
  return `${baseUrl}/api/digest/chart/tool-health/${date}`;
}

export type DigestEmailProps = {
  digest: DigestBody;
  /** Origin for the public /digest/{date} permalinks and share pages.
   *  Example: "https://gawk.dev". No trailing slash. */
  baseUrl: string;
  /** Per-recipient unsubscribe URL — already composed with the recipient's
   *  token, so the template doesn't need the token directly. */
  unsubUrl: string;
  /** Recipient's country code (ISO-3166-1 alpha-2) for the geo greeting.
   *  Null when unknown — the greeting drops the geo clause. */
  countryCode?: string | null;
};

/** Dark-palette overrides. Class-based so the media query (and Outlook's
 *  [data-ogsc] dark path) can beat the inline light-mode styles. Kept to
 *  a deliberately small surface: backgrounds, ink, and the three semantic
 *  colours re-tuned for dark contrast. */
const DARK_CSS = `
  @media (prefers-color-scheme: dark) {
    .ge-body { background-color: #0B0F17 !important; }
    .ge-card { background-color: #111827 !important; border-color: #1F2937 !important; }
    .ge-hero { background-color: #0F1722 !important; border-color: #1F2937 !important; }
    .ge-ink { color: #E6E7EB !important; }
    .ge-mut { color: #9CA3AF !important; }
    .ge-kick { color: #94A3B8 !important; }
    .ge-up { color: #4ADE80 !important; }
    .ge-down { color: #F87171 !important; }
    .ge-link { color: #93C5FD !important; }
    .ge-brand { color: #2DD4BF !important; }
  }
  [data-ogsc] .ge-body { background-color: #0B0F17 !important; }
  [data-ogsc] .ge-card { background-color: #111827 !important; border-color: #1F2937 !important; }
  [data-ogsc] .ge-hero { background-color: #0F1722 !important; border-color: #1F2937 !important; }
  [data-ogsc] .ge-ink { color: #E6E7EB !important; }
  [data-ogsc] .ge-mut { color: #9CA3AF !important; }
  [data-ogsc] .ge-kick { color: #94A3B8 !important; }
  [data-ogsc] .ge-up { color: #4ADE80 !important; }
  [data-ogsc] .ge-down { color: #F87171 !important; }
  [data-ogsc] .ge-link { color: #93C5FD !important; }
  [data-ogsc] .ge-brand { color: #2DD4BF !important; }
`;

export function DigestEmail({
  digest,
  baseUrl,
  unsubUrl,
  countryCode,
}: DigestEmailProps): React.JSX.Element {
  const greeting = renderGreeting({
    template: digest.greetingTemplate,
    countryCode: countryCode ?? null,
  });
  const permalink = `${baseUrl}/digest/${digest.date}`;
  const shareText = composeShareText("Gawk daily digest", digest.subject);
  const liUrl = buildShareUrl({
    platform: "linkedin",
    url: permalink,
    text: shareText,
  });
  const xUrl = buildShareUrl({ platform: "x", url: permalink, text: shareText });

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{DARK_CSS}</style>
      </Head>
      <Preview>{digest.subject}</Preview>
      <Body className="ge-body" style={styles.body}>
        <Container style={styles.container}>
          {/* Masthead: dark band in BOTH palettes — brand anchor. */}
          <Section style={styles.band}>
            <Text style={styles.bandBrand}>
              GAWK
              <span style={styles.bandTag}> · the AI ecosystem, verbatim</span>
            </Text>
            <Text style={styles.bandDate}>{digest.date}</Text>
          </Section>

          <Heading as="h1" className="ge-ink" style={styles.h1}>
            {digest.subject}
          </Heading>
          {digest.tldr ? (
            <Text className="ge-brand" style={styles.tldr}>
              {digest.tldr}
            </Text>
          ) : (
            <Text className="ge-mut" style={styles.greeting}>
              {greeting}
            </Text>
          )}

          {digest.inferences && digest.inferences.length > 0 ? (
            <Section
              className="ge-hero"
              style={styles.hero}
              data-testid="digest-inferences"
            >
              <Text style={styles.heroLabel}>What moved</Text>
              {digest.inferences.map((line, i) => (
                <Text
                  key={i}
                  className={heroLineClass(deltaDirection(line))}
                  style={heroLineStyle(deltaDirection(line))}
                >
                  {heroGlyph(deltaDirection(line))} {line}
                </Text>
              ))}
            </Section>
          ) : null}

          {digest.sections.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              baseUrl={baseUrl}
              date={digest.date}
            />
          ))}

          {/* ONE call-to-action block for the whole issue. */}
          <Section style={styles.ctaBlock}>
            <Text style={styles.ctaRow}>
              <Link href={permalink} style={styles.primaryButton}>
                Read today&rsquo;s full brief on Gawk →
              </Link>
            </Text>
            <Text className="ge-mut" style={styles.shareRow}>
              Worth a colleague&rsquo;s inbox?{" "}
              <Link href={liUrl} className="ge-link" style={styles.link}>
                Share on LinkedIn
              </Link>
              {" · "}
              <Link href={xUrl} className="ge-link" style={styles.link}>
                Share on X
              </Link>
            </Text>
          </Section>

          <Text className="ge-mut" style={styles.footer}>
            You&rsquo;re receiving this because you subscribed to the AI
            Pulse daily digest. Every number traces to a public source.{" "}
            <Link
              href={`${baseUrl}/privacy`}
              className="ge-link"
              style={styles.link}
            >
              Privacy
            </Link>
            {" · "}
            <Link href={unsubUrl} className="ge-link" style={styles.link}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function SectionBlock({
  section,
  baseUrl,
  date,
}: {
  section: DigestSection;
  baseUrl: string;
  date: string;
}): React.JSX.Element {
  const sectionUrl = `${baseUrl}/digest/${date}#${section.anchorSlug}`;

  return (
    <Section className="ge-card" style={styles.card}>
      <Text className="ge-kick" style={styles.kicker}>
        {section.title}
      </Text>
      <Heading as="h2" className="ge-ink" style={styles.cardHeadline}>
        {section.headline}
      </Heading>
      <Text className="ge-mut" style={styles.whyThisMatters}>
        <span style={styles.whyThisMattersLabel}>Why this matters · </span>
        {whyThisMatters(section.id)}
      </Text>

      {section.id === "tool-health" ? (
        <Img
          src={toolHealthChartUrl(baseUrl, date)}
          alt={`Tool health, 7 days ending ${date}. Each row is one tool; each column is one UTC day. Green = operational, amber = degraded, red = outage, grey = no data.`}
          width={TOOL_HEALTH_CHART_W}
          height={TOOL_HEALTH_CHART_H}
          style={styles.chart}
        />
      ) : null}

      {section.items.length > 0 ? (
        <div>
          {section.items.map((item, i) => (
            <ItemRow key={i} item={item} baseUrl={baseUrl} />
          ))}
        </div>
      ) : null}

      <Text className="ge-mut" style={styles.sourceLine}>
        {section.sourceUrls.length > 0 ? (
          <>
            Source:{" "}
            {section.sourceUrls.map((u, i) => (
              <span key={u}>
                <Link href={u} className="ge-link" style={styles.link}>
                  {displaySource(u)}
                </Link>
                {i < section.sourceUrls.length - 1 ? ", " : ""}
              </span>
            ))}
            {" · "}
          </>
        ) : null}
        <Link href={sectionUrl} className="ge-link" style={styles.link}>
          View on Gawk →
        </Link>
      </Text>
    </Section>
  );
}

function ItemRow({
  item,
  baseUrl,
}: {
  item: DigestSectionItem;
  baseUrl: string;
}): React.JSX.Element {
  const direction = deltaDirection(item.detail, item.headline);
  return (
    <div style={itemStyle(direction)}>
      <Text className="ge-ink" style={styles.itemHeadline}>
        {item.headline}
      </Text>
      {item.detail ? (
        <Text
          className={direction === "neutral" ? "ge-mut" : deltaClass(direction)}
          style={detailStyle(direction)}
        >
          {item.detail}
        </Text>
      ) : null}
      {item.sourceUrl || item.panelHref ? (
        <Text style={styles.itemSource}>
          {item.sourceUrl ? (
            <Link href={item.sourceUrl} className="ge-link" style={styles.link}>
              {item.sourceLabel ?? displaySource(item.sourceUrl)}
            </Link>
          ) : null}
          {(() => {
            const tx = item.sourceUrl
              ? deriveTranslateUrl(item.sourceUrl, item.sourceLang)
              : null;
            if (!tx) return null;
            return (
              <>
                {" · "}
                <Link href={tx} className="ge-link" style={styles.link}>
                  {TRANSLATE_LABEL}
                </Link>
              </>
            );
          })()}
          {item.sourceUrl && item.panelHref ? " · " : ""}
          {item.panelHref ? (
            <Link
              href={`${baseUrl}${item.panelHref}`}
              className="ge-link"
              style={styles.link}
            >
              View on Gawk →
            </Link>
          ) : null}
        </Text>
      ) : null}
      {item.caveat ? (
        <Text className="ge-mut" style={styles.itemCaveat}>
          {item.caveat}
        </Text>
      ) : null}
    </div>
  );
}

function displaySource(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function renderDigestHtml(
  props: DigestEmailProps,
): Promise<string> {
  return render(<DigestEmail {...props} />);
}

// ---------------------------------------------------------------------------
// Styles — light palette inline (the base), dark palette via DARK_CSS classes.
// ---------------------------------------------------------------------------

const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO =
  '"SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/** Semantic colours, light palette (WCAG AA on white). */
const UP = "#15803D";
const DOWN = "#B91C1C";
const INK = "#111827";
const MUT = "#6B7280";
const BORDER = "#E5E7EB";

function deltaClass(d: DeltaDirection): string {
  return d === "up" ? "ge-up" : d === "down" ? "ge-down" : "ge-mut";
}

function heroGlyph(d: DeltaDirection): string {
  return d === "up" ? "▲" : d === "down" ? "▼" : "■";
}

function heroLineClass(d: DeltaDirection): string {
  return d === "neutral" ? "ge-ink" : deltaClass(d);
}

function heroLineStyle(d: DeltaDirection): React.CSSProperties {
  return {
    fontFamily: SANS,
    fontSize: "14px",
    lineHeight: "21px",
    fontWeight: 600,
    color: d === "up" ? UP : d === "down" ? DOWN : INK,
    margin: "4px 0",
  };
}

function itemStyle(d: DeltaDirection): React.CSSProperties {
  return {
    margin: "12px 0",
    padding: "0 0 0 10px",
    borderLeft: `3px solid ${d === "up" ? UP : d === "down" ? DOWN : BORDER}`,
  };
}

function detailStyle(d: DeltaDirection): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: "13px",
    lineHeight: "19px",
    fontWeight: d === "neutral" ? 400 : 700,
    color: d === "up" ? UP : d === "down" ? DOWN : MUT,
    margin: "2px 0 0 0",
  };
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: "#F4F5F7",
    color: INK,
    margin: 0,
    fontFamily: SANS,
  },
  container: {
    maxWidth: "620px",
    margin: "24px auto",
    padding: "0 0 24px 0",
  },
  band: {
    backgroundColor: "#0F172A",
    borderRadius: "10px 10px 0 0",
    padding: "14px 24px",
  },
  bandBrand: {
    fontFamily: SANS,
    fontSize: "16px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    color: "#FFFFFF",
    margin: 0,
  },
  bandTag: {
    fontSize: "11px",
    fontWeight: 400,
    letterSpacing: "0.02em",
    color: "#94A3B8",
  },
  bandDate: {
    fontFamily: MONO,
    fontSize: "12px",
    color: "#94A3B8",
    margin: "2px 0 0 0",
  },
  h1: {
    fontSize: "21px",
    fontWeight: 700,
    color: INK,
    margin: "20px 24px 8px 24px",
  },
  tldr: {
    fontFamily: MONO,
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.01em",
    color: "#0F766E",
    margin: "0 24px 8px 24px",
  },
  greeting: {
    fontSize: "14px",
    lineHeight: "22px",
    color: MUT,
    margin: "0 24px 8px 24px",
  },
  hero: {
    margin: "8px 24px 4px 24px",
    padding: "12px 16px",
    backgroundColor: "#F8FAFC",
    border: `1px solid ${BORDER}`,
    borderLeft: "3px solid #0F766E",
    borderRadius: "8px",
  },
  heroLabel: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase" as const,
    color: "#0F766E",
    margin: "0 0 6px 0",
  },
  card: {
    margin: "16px 24px",
    padding: "16px",
    backgroundColor: "#FFFFFF",
    border: `1px solid ${BORDER}`,
    borderRadius: "8px",
  },
  kicker: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "#64748B",
    margin: "0 0 4px 0",
  },
  cardHeadline: {
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: "21px",
    color: INK,
    margin: "0 0 8px 0",
  },
  whyThisMatters: {
    fontSize: "12px",
    lineHeight: "17px",
    color: MUT,
    margin: "0 0 10px 0",
  },
  whyThisMattersLabel: {
    color: "#0F766E",
    fontWeight: 600,
  },
  chart: {
    display: "block",
    width: "100%",
    maxWidth: `${TOOL_HEALTH_CHART_W}px`,
    height: "auto",
    margin: "0 0 12px 0",
    border: `1px solid ${BORDER}`,
    borderRadius: "4px",
  },
  itemHeadline: {
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: 500,
    color: INK,
    margin: 0,
  },
  itemSource: {
    fontSize: "11px",
    margin: "2px 0 0 0",
  },
  itemCaveat: {
    fontSize: "11px",
    color: MUT,
    fontStyle: "italic" as const,
    margin: "2px 0 0 0",
  },
  sourceLine: {
    fontSize: "11px",
    color: MUT,
    margin: "10px 0 0 0",
  },
  ctaBlock: {
    margin: "20px 24px 0 24px",
    textAlign: "center" as const,
  },
  ctaRow: { margin: 0 },
  primaryButton: {
    display: "inline-block",
    padding: "10px 18px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#FFFFFF",
    backgroundColor: "#0F766E",
    borderRadius: "8px",
    textDecoration: "none",
  },
  shareRow: {
    fontSize: "12px",
    color: MUT,
    margin: "10px 0 0 0",
  },
  footer: {
    fontSize: "11px",
    color: MUT,
    lineHeight: "18px",
    margin: "20px 24px 0 24px",
  },
  link: { color: "#0369A1" },
};

export default DigestEmail;
