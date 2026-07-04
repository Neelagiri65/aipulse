/**
 * Daily-digest email template — Direction A v3, Nativerse brand system.
 *
 * v3 applies the canonical Nativerse Brand Bible (~/nativerse-site/brand/
 * BRAND-BIBLE.md, "warm technical"): GAWK is the live-telemetry track of a
 * branded house, so the digest is an endorsed sub-brand — "GAWK, by
 * nativerse". Warm paper #FAFAF6 ground, ink #16160F, ONE accent (royal
 * blue #2A33C2), Sentient 500 for display (Fontshare link with the
 * bible's own fallbacks — Gmail falls back gracefully, Apple Mail gets
 * the real face), Tabular mono kickers at 0.18em, brand status colours
 * for data direction, hairlines #E7E6DE, small radii.
 *
 * v2 after founder review of v1 ("mediocre"): the difference between a
 * styled list and a data product is STRUCTURE — numbers live in their own
 * right-aligned monospace column, ranks get chips, the TL;DR becomes a
 * stat-chip row, and the masthead carries the live-data identity. All of
 * it built from tables and background colours — the only layout primitives
 * that survive Gmail, Outlook (Word engine), and Apple Mail alike. No SVG
 * (Gmail strips it), no positioned elements, no web fonts.
 *
 * Colour strategy (verified 3-0, Litmus): light-base + explicit dark
 * palette via `prefers-color-scheme` + `[data-ogsc]` overrides and
 * `color-scheme` meta tags — an always-dark email gets force-inverted by
 * Gmail iOS / Outlook Windows, so dark is opt-in, not the base.
 *
 * Trust contract unchanged: every number renders verbatim from the
 * composed DigestBody. `deltaDirection` picks colours; `splitDelta` only
 * decides WHERE a verbatim string renders (right column vs under the
 * headline) — copy is byte-identical either way.
 */

import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/components";
import type {
  DigestBody,
  DigestSection,
  DigestSectionItem,
} from "@/lib/digest/types";
import {
  deltaDirection,
  splitFirstSignedToken,
  type DeltaDirection,
} from "@/lib/email/delta";
import { renderGreeting } from "@/lib/email/greeting";
import { buildShareUrl, composeShareText } from "@/lib/email/share-urls";
import { markPngFor } from "@/lib/digest/marks";
import { deriveTranslateUrl, TRANSLATE_LABEL } from "@/lib/i18n/translate-link";
import { whyThisMatters } from "@/lib/digest/why-this-matters";

const TOOL_HEALTH_CHART_W = 720;
const TOOL_HEALTH_CHART_H = 320;
function toolHealthChartUrl(baseUrl: string, date: string): string {
  return `${baseUrl}/api/digest/chart/tool-health/${date}`;
}

export type DigestEmailProps = {
  digest: DigestBody;
  /** Origin for the public /digest/{date} permalinks and share pages. */
  baseUrl: string;
  /** Per-recipient unsubscribe URL — already composed with the token. */
  unsubUrl: string;
  /** Recipient country (ISO-3166-1 alpha-2) for the geo greeting. */
  countryCode?: string | null;
};

/** Dark-palette overrides, class-based so they can beat inline styles. */
const DARK_CSS = `
  @media (prefers-color-scheme: dark) {
    .ge-body { background-color: #16160F !important; }
    .ge-card { background-color: #1E1E16 !important; border-color: #34342A !important; }
    .ge-hero { background-color: #1B1B13 !important; border-color: #34342A !important; }
    .ge-chip { background-color: #1E1E16 !important; border-color: #34342A !important; }
    .ge-ink { color: #FAFAF6 !important; }
    .ge-mut { color: #A3A396 !important; }
    .ge-kick { color: #8C8C7E !important; }
    .ge-up { color: #4CAF6E !important; }
    .ge-down { color: #E06052 !important; }
    .ge-link { color: #9AA3FF !important; }
    .ge-brand { color: #9AA3FF !important; }
    .ge-rank { background-color: #2A2A20 !important; color: #FAFAF6 !important; }
  }
  [data-ogsc] .ge-body { background-color: #16160F !important; }
  [data-ogsc] .ge-card { background-color: #1E1E16 !important; border-color: #34342A !important; }
  [data-ogsc] .ge-hero { background-color: #1B1B13 !important; border-color: #34342A !important; }
  [data-ogsc] .ge-chip { background-color: #1E1E16 !important; border-color: #34342A !important; }
  [data-ogsc] .ge-ink { color: #FAFAF6 !important; }
  [data-ogsc] .ge-mut { color: #A3A396 !important; }
  [data-ogsc] .ge-kick { color: #8C8C7E !important; }
  [data-ogsc] .ge-up { color: #4CAF6E !important; }
  [data-ogsc] .ge-down { color: #E06052 !important; }
  [data-ogsc] .ge-link { color: #9AA3FF !important; }
  [data-ogsc] .ge-brand { color: #9AA3FF !important; }
  [data-ogsc] .ge-rank { background-color: #2A2A20 !important; color: #FAFAF6 !important; }
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
  const chips = digest.tldr
    ? digest.tldr.split("·").map((c) => c.trim()).filter(Boolean)
    : [];

  return (
    <Html>
      <Head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=sentient@400,500,700&f[]=supreme@400,500,600&f[]=tabular@400,500&display=swap"
        />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{DARK_CSS}</style>
      </Head>
      <Preview>{digest.subject}</Preview>
      <Body className="ge-body" style={styles.body}>
        <Container style={styles.container}>
          {/* Masthead — dark in both palettes; the brand anchor. */}
          <Section style={styles.band}>
            <Row>
              <Column>
                <Text style={styles.bandKicker}>LIVE TELEMETRY</Text>
                <Text style={styles.bandBrand}>GAWK</Text>
                <Text style={styles.bandBy}>
                  <Img
                    src={`${baseUrl}/brand/nativerse-mark.png`}
                    width={16}
                    height={16}
                    alt="Nativerse"
                    style={{
                      display: "inline-block",
                      verticalAlign: "middle",
                      marginRight: "6px",
                    }}
                  />
                  by nativerse
                </Text>
              </Column>
              <Column style={styles.bandRight}>
                <Text style={styles.bandLive}>
                  <span style={styles.liveDot}>●</span> LIVE · 40 sources
                </Text>
                <Text style={styles.bandDate}>{digest.date}</Text>
              </Column>
            </Row>
          </Section>
          <Section style={styles.bandRule} />

          <Heading as="h1" className="ge-ink" style={styles.h1}>
            {digest.subject}
          </Heading>
          {chips.length === 0 ? (
            <Text className="ge-mut" style={styles.greeting}>
              {greeting}
            </Text>
          ) : null}

          {/* TL;DR as a stat-chip row — the issue at a glance. */}
          {chips.length > 0 ? (
            <table
              role="presentation"
              width="100%"
              cellPadding={0}
              cellSpacing={0}
              style={styles.chipRow}
            >
              <tbody>
                <tr>
                  {chips.slice(0, 5).map((chip, i) => {
                    const m = chip.match(/^(\d+)\s+(.*)$/);
                    return (
                      <td
                        key={i}
                        className="ge-chip"
                        style={{
                          ...styles.chip,
                          ...(i === 0 ? {} : { borderLeft: "none" }),
                        }}
                      >
                        <p className="ge-ink" style={styles.chipNum}>
                          {m ? m[1] : chip}
                        </p>
                        {m ? (
                          <p className="ge-mut" style={styles.chipLabel}>
                            {m[2]}
                          </p>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          ) : null}

          {digest.inferences && digest.inferences.length > 0 ? (
            <Section
              className="ge-hero"
              style={styles.hero}
              data-testid="digest-inferences"
            >
              <p style={styles.heroLabel}>What moved</p>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  {digest.inferences.map((line, i) => {
                    const d = deltaDirection(line);
                    const parts = splitFirstSignedToken(line);
                    return (
                      <tr key={i}>
                        <td style={{ width: 20, verticalAlign: "top" }}>
                          <p className={deltaClass(d)} style={heroGlyphStyle(d)}>
                            {heroGlyph(d)}&nbsp;
                          </p>
                        </td>
                        <td>
                          <p className="ge-ink" style={styles.heroLine}>
                            {!parts ? (
                              line
                            ) : (
                              <>
                                {parts.before}
                                <span
                                  className={deltaClass(parts.direction)}
                                  style={heroTokenStyle(parts.direction)}
                                >
                                  {parts.token}
                                </span>
                                {parts.after}
                              </>
                            )}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
            GAWK is the live-telemetry track of Nativerse. Clarity. Trust.
            You&rsquo;re receiving this because you subscribed to the daily
            digest. Every number traces to a public source.{" "}
            <Link
              href={`${baseUrl}/privacy`}
              className="ge-link"
              style={styles.link}
            >
              Privacy
            </Link>
            {"  ·  "}
            <Link href={unsubUrl} className="ge-link" style={styles.link}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** A headline like "#3 claude-fable-5" earns a rank chip; the chip text is
 *  the verbatim "#3" token, the remainder renders beside it. Display-only
 *  split of the composer's string — no rewriting. */
function splitRank(headline: string): { rank: string; rest: string } | null {
  const m = headline.match(/^(#\d+)\s+(.*)$/);
  return m ? { rank: m[1], rest: m[2] } : null;
}

/** A detail like "−22.1k 24h downloads day-over-day" splits into the signed
 *  figure ("−22.1k") for the right-hand mono column and its verbatim
 *  remainder ("24h downloads day-over-day") as the unit line. Returns null
 *  when the detail doesn't LEAD with a signed figure — then the whole
 *  string renders under the headline unchanged. */
function splitDelta(
  detail: string,
): { figure: string; unit: string } | null {
  const m = detail.match(/^([+\-−▲▼]\s?[\d.,]+[kKmMbB%]?)\s+(.*)$/);
  return m ? { figure: m[1], unit: m[2] } : null;
}

/** Per-section render cap. Bounds the email's worst-case size under
 *  Gmail's ~102KB clip (which would hide the unsubscribe link). Overflow
 *  is DISCLOSED — an explicit "+K more" line deep-linking to the full
 *  section — never silently dropped. */
const MAX_ITEMS_PER_SECTION = 6;

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
  const visible = section.items.slice(0, MAX_ITEMS_PER_SECTION);
  const overflow = section.items.length - visible.length;

  return (
    <Section className="ge-card" style={styles.card}>
      <p className="ge-kick" style={styles.kicker}>
        {section.title}
      </p>
      <h2 className="ge-ink" style={styles.cardHeadline}>
        {section.headline}
      </h2>
      <p className="ge-mut" style={styles.whyThisMatters}>
        <span style={styles.whyThisMattersLabel}>Why this matters</span>
        {" · "}
        {whyThisMatters(section.id)}
      </p>

      {section.id === "tool-health" ? (
        <Img
          src={toolHealthChartUrl(baseUrl, date)}
          alt={`Tool health, 7 days ending ${date}. Each row is one tool; each column is one UTC day. Green = operational, amber = degraded, red = outage, grey = no data.`}
          width={TOOL_HEALTH_CHART_W}
          height={TOOL_HEALTH_CHART_H}
          style={styles.chart}
        />
      ) : null}

      {visible.map((item, i) => (
        <ItemRow
          key={i}
          item={item}
          baseUrl={baseUrl}
          isLast={i === visible.length - 1 && overflow === 0}
        />
      ))}
      {overflow > 0 ? (
        <p className="ge-mut" style={leanStyles.overflow}>
          {`+${overflow} more in this section · `}
          <a href={sectionUrl} className="ge-link" style={leanStyles.a}>
            View all on Gawk →
          </a>
        </p>
      ) : null}

      <p className="ge-mut" style={styles.sourceLine}>
        {section.sourceUrls.length > 0 ? (
          <>
            Source:{" "}
            {section.sourceUrls.map((u, i) => (
              <span key={u}>
                <a href={u} className="ge-link" style={leanStyles.a}>
                  {displaySource(u)}
                </a>
                {i < section.sourceUrls.length - 1 ? ", " : ""}
              </span>
            ))}
            {" · "}
          </>
        ) : null}
        <a href={sectionUrl} className="ge-link" style={leanStyles.a}>
          View on Gawk →
        </a>
      </p>
    </Section>
  );
}

function ItemRow({
  item,
  baseUrl,
  isLast,
}: {
  item: DigestSectionItem;
  baseUrl: string;
  isLast: boolean;
}): React.JSX.Element {
  const direction = deltaDirection(item.detail, item.headline);
  const rank = splitRank(item.headline);
  const delta = item.detail ? splitDelta(item.detail) : null;
  // Strict monochrome (founder rule): only the pre-rendered charcoal
  // marks, served absolute from gawk.dev; no colour favicon fallback.
  const iconPath = !rank
    ? markPngFor(item.sourceLabel, item.headline, item.sourceUrl)
    : null;
  const icon = iconPath ? `${baseUrl}${iconPath}` : null;
  const tx = item.sourceUrl
    ? deriveTranslateUrl(item.sourceUrl, item.sourceLang)
    : null;
  const edge = direction === "up" ? UP : direction === "down" ? DOWN : BORDER;

  // Raw, minimal markup: one table, compact single-string styles. This is
  // the render hot loop — react-email's Text/Row/Column here cost ~2.5KB
  // per item and pushed a busy day past Gmail's ~102KB clip (which hides
  // the unsubscribe link). Verified by the clip-guard test.
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{
        margin: isLast ? "0" : "0 0 4px 0",
        borderLeft: `3px solid ${edge}`,
      }}
    >
      <tbody>
        <tr>
          {icon ? (
            <td style={{ width: 30, verticalAlign: "top", paddingLeft: 10 }}>
              <img
                src={icon}
                width={14}
                height={14}
                alt=""
                style={{
                  display: "block",
                  backgroundColor: SUNK,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 4,
                  padding: 3,
                }}
              />
            </td>
          ) : (
            <td style={{ width: 12 }} />
          )}
          <td style={{ padding: "6px 0" }}>
            <p className="ge-ink" style={leanStyles.headline}>
              {rank ? (
                <>
                  <span className="ge-rank" style={leanStyles.rankChip}>
                    {rank.rank}
                  </span>{" "}
                  {rank.rest}
                </>
              ) : (
                item.headline
              )}
            </p>
            {item.detail && delta ? (
              <p className="ge-mut" style={leanStyles.unit}>
                {delta.unit}
              </p>
            ) : null}
            {item.detail && !delta ? (
              <p
                className={direction === "neutral" ? "ge-mut" : deltaClass(direction)}
                style={{ ...leanStyles.detail, color: deltaColor(direction) }}
              >
                {item.detail}
              </p>
            ) : null}
            {item.sourceUrl || item.panelHref ? (
              <p style={leanStyles.source}>
                {item.sourceUrl ? (
                  <a href={item.sourceUrl} className="ge-link" style={leanStyles.a}>
                    {item.sourceLabel ?? displaySource(item.sourceUrl)}
                  </a>
                ) : null}
                {tx ? (
                  <>
                    {" · "}
                    <a href={tx} className="ge-link" style={leanStyles.a}>
                      {TRANSLATE_LABEL}
                    </a>
                  </>
                ) : null}
                {item.sourceUrl && item.panelHref ? " · " : ""}
                {item.panelHref ? (
                  <a
                    href={`${baseUrl}${item.panelHref}`}
                    className="ge-link"
                    style={leanStyles.a}
                  >
                    View on Gawk →
                  </a>
                ) : null}
              </p>
            ) : null}
            {item.caveat ? (
              <p className="ge-mut" style={leanStyles.caveat}>
                {item.caveat}
              </p>
            ) : null}
          </td>
          {delta ? (
            <td style={{ width: 96, verticalAlign: "top", textAlign: "right", padding: "6px 0" }}>
              <p
                className={deltaClass(direction)}
                style={{ ...leanStyles.figure, color: deltaColor(direction) }}
              >
                {delta.figure}
              </p>
            </td>
          ) : null}
        </tr>
      </tbody>
    </table>
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
// Styles — light palette inline (base); dark palette via DARK_CSS classes.
// ---------------------------------------------------------------------------

/** Nativerse type system (BRAND-BIBLE §15): Sentient display, Supreme
 *  text, Tabular mono — each with the bible's own fallback stack, so
 *  clients that strip webfonts (Gmail) degrade to the brand fallbacks. */
const DISPLAY = "Sentient,Georgia,serif";
const SANS = "Supreme,-apple-system,Segoe UI,Arial,sans-serif";
const MONO = "Tabular,ui-monospace,Menlo,monospace";

/** Nativerse palette (BRAND-BIBLE §14). Status colours carry data
 *  direction; royal blue is the ONLY accent. */
const UP = "#157A40";
const DOWN = "#C0392B";
const INK = "#16160F";
const BODY = "#3A3A30";
const MUT = "#6B6B5E";
const BORDER = "#E7E6DE";
const BRAND = "#2A33C2";
const PAPER = "#FAFAF6";
const SUNK = "#F2F1EA";

function deltaClass(d: DeltaDirection): string {
  return d === "up" ? "ge-up" : d === "down" ? "ge-down" : "ge-mut";
}
function deltaColor(d: DeltaDirection): string {
  return d === "up" ? UP : d === "down" ? DOWN : MUT;
}
function heroGlyph(d: DeltaDirection): string {
  return d === "up" ? "▲" : d === "down" ? "▼" : "■";
}
function heroGlyphStyle(d: DeltaDirection): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: "13px",
    lineHeight: "21px",
    fontWeight: 700,
    color: d === "neutral" ? BRAND : deltaColor(d),
    margin: 0,
  };
}
function heroTokenStyle(d: DeltaDirection): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontWeight: 500,
    color: deltaColor(d),
  };
}


function deltaFigureStyle(d: DeltaDirection): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: "17px",
    lineHeight: "22px",
    fontWeight: 700,
    color: deltaColor(d),
    margin: 0,
    whiteSpace: "nowrap" as const,
  };
}
function detailInlineStyle(d: DeltaDirection): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: "12px",
    lineHeight: "18px",
    fontWeight: d === "neutral" ? 400 : 700,
    color: deltaColor(d),
    margin: "2px 0 0 0",
  };
}

/** Compact single-object styles for the item hot loop. */
const leanStyles: Record<string, React.CSSProperties> = {
  headline: { fontSize: 14, lineHeight: "20px", fontWeight: 500, color: INK, margin: 0 },
  unit: { fontFamily: MONO, fontSize: 11, lineHeight: "16px", color: MUT, margin: "2px 0 0" },
  detail: { fontFamily: MONO, fontSize: 12, lineHeight: "18px", fontWeight: 500, margin: "2px 0 0" },
  figure: { fontFamily: MONO, fontSize: 17, lineHeight: "22px", fontWeight: 700, margin: 0, whiteSpace: "nowrap" },
  source: { fontSize: 11, lineHeight: "16px", margin: "3px 0 0" },
  caveat: { fontSize: 11, lineHeight: "15px", color: MUT, fontStyle: "italic", margin: "3px 0 0" },
  rankChip: {
    display: "inline-block", fontFamily: MONO, fontSize: 12, fontWeight: 500,
    color: INK, backgroundColor: SUNK, border: `1px solid ${BORDER}`,
    borderRadius: 2, padding: "1px 6px",
  },
  a: { color: BRAND, textDecoration: "none" },
  overflow: {
    fontSize: 12,
    lineHeight: "17px",
    color: MUT,
    margin: "6px 0 0 12px",
  },
};

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: PAPER,
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
    backgroundColor: INK,
    borderRadius: "8px 8px 0 0",
    padding: "18px 24px 14px 24px",
  },
  bandRule: {
    backgroundColor: BRAND,
    height: "3px",
    lineHeight: "3px",
    fontSize: "0px",
    margin: 0,
  },
  bandKicker: {
    fontFamily: MONO,
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
    color: "#9AA3FF",
    margin: "0 0 3px 0",
  },
  bandBrand: {
    fontFamily: MONO,
    fontSize: "24px",
    fontWeight: 500,
    letterSpacing: "0.16em",
    color: "#FAFAF6",
    margin: 0,
  },
  bandBy: {
    fontFamily: DISPLAY,
    fontSize: "13px",
    fontWeight: 400,
    color: "#A3A396",
    margin: "4px 0 0 0",
  },
  bandRight: {
    textAlign: "right" as const,
    verticalAlign: "top",
  },
  bandLive: {
    fontFamily: MONO,
    fontSize: "10px",
    letterSpacing: "0.14em",
    color: "#A3A396",
    margin: 0,
  },
  liveDot: { color: "#9AA3FF" },
  bandDate: {
    fontFamily: MONO,
    fontSize: "13px",
    fontWeight: 500,
    color: "#FAFAF6",
    margin: "3px 0 0 0",
  },
  h1: {
    fontFamily: DISPLAY,
    fontSize: "26px",
    fontWeight: 500,
    letterSpacing: "-0.018em",
    lineHeight: "32px",
    color: INK,
    margin: "22px 24px 10px 24px",
  },
  greeting: {
    fontSize: "14px",
    lineHeight: "22px",
    color: BODY,
    margin: "0 24px 8px 24px",
  },
  chipRow: {
    margin: "0 24px 6px 24px",
  },
  chip: {
    backgroundColor: "#FFFFFF",
    border: `1px solid ${BORDER}`,
    padding: "8px 10px",
    textAlign: "center" as const,
  },
  chipNum: {
    fontFamily: MONO,
    fontSize: "18px",
    fontWeight: 700,
    color: INK,
    margin: 0,
    lineHeight: "22px",
  },
  chipLabel: {
    fontSize: "10px",
    letterSpacing: "0.02em",
    color: MUT,
    margin: "1px 0 0 0",
    lineHeight: "13px",
  },
  hero: {
    margin: "12px 24px 4px 24px",
    padding: "14px 16px",
    backgroundColor: SUNK,
    border: `1px solid ${BORDER}`,
    borderLeft: `3px solid ${BRAND}`,
    borderRadius: "4px",
  },
  heroLabel: {
    fontFamily: MONO,
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.2em",
    textTransform: "uppercase" as const,
    color: BRAND,
    margin: "0 0 8px 0",
  },
  heroRow: { margin: 0 },
  heroGlyphCol: { width: "22px", verticalAlign: "top" },
  heroLine: {
    fontSize: "14px",
    lineHeight: "21px",
    fontWeight: 600,
    color: INK,
    margin: "0 0 6px 0",
  },
  card: {
    margin: "16px 24px",
    padding: "16px 18px",
    backgroundColor: "#FFFFFF",
    border: `1px solid ${BORDER}`,
    borderRadius: "8px",
  },
  kicker: {
    fontFamily: MONO,
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
    color: BRAND,
    margin: 0,
  },
  cardHeadline: {
    fontFamily: DISPLAY,
    fontSize: "18px",
    fontWeight: 500,
    letterSpacing: "-0.008em",
    lineHeight: "24px",
    color: INK,
    margin: "6px 0 6px 0",
  },
  whyThisMatters: {
    fontSize: "12px",
    lineHeight: "17px",
    color: MUT,
    margin: "0 0 12px 0",
  },
  whyThisMattersLabel: {
    color: BRAND,
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
  iconCol: { width: "30px", verticalAlign: "top" },
  iconTile: {
    display: "block",
    backgroundColor: SUNK,
    border: `1px solid ${BORDER}`,
    borderRadius: "4px",
    padding: "3px",
    marginTop: "0px",
  },
  rankChip: {
    display: "inline-block",
    fontFamily: MONO,
    fontSize: "12px",
    fontWeight: 500,
    color: INK,
    backgroundColor: SUNK,
    border: `1px solid ${BORDER}`,
    borderRadius: "2px",
    padding: "1px 6px",
  },
  itemUnit: {
    fontFamily: MONO,
    fontSize: "11px",
    lineHeight: "16px",
    color: MUT,
    margin: "2px 0 0 0",
  },
  deltaCol: {
    textAlign: "right" as const,
    verticalAlign: "top",
    width: "96px",
  },
  itemSource: {
    fontSize: "11px",
    margin: "4px 0 0 0",
  },
  itemCaveat: {
    fontSize: "11px",
    color: MUT,
    fontStyle: "italic" as const,
    margin: "3px 0 0 0",
  },
  sourceLine: {
    fontSize: "11px",
    color: MUT,
    margin: "12px 0 0 0",
  },
  ctaBlock: {
    margin: "20px 24px 0 24px",
    textAlign: "center" as const,
  },
  ctaRow: { margin: 0 },
  primaryButton: {
    display: "inline-block",
    padding: "11px 20px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#FFFFFF",
    backgroundColor: BRAND,
    borderRadius: "4px",
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
  link: { color: BRAND },
};

export default DigestEmail;
