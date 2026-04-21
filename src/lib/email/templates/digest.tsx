/**
 * Daily-digest email template.
 *
 * Renders the pure `DigestBody` shape (composed upstream) into an
 * email-safe HTML document. Dark theme mirrors the site chrome —
 * near-black body, teal accents, source links in light-blue.
 *
 * Each of the five sections renders:
 *   - Title + headline
 *   - Item list (headline + optional detail + per-item source link)
 *   - Section-level source citation
 *   - "View on AI Pulse" deep link to /digest/{date}#{anchorSlug}
 *   - Two share affordances (LinkedIn, X) with pre-composed copy
 *
 * Header carries the per-recipient greeting; footer the per-recipient
 * unsubscribe link + a reminder why the email was received.
 *
 * The template is a pure React component — no fetch, no env reads.
 * `renderDigestHtml` turns it into the string passed to Resend.
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
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
import { renderGreeting } from "@/lib/email/greeting";
import { buildShareUrl, composeShareText } from "@/lib/email/share-urls";

export type DigestEmailProps = {
  digest: DigestBody;
  /** Origin for the public /digest/{date} permalinks and share pages.
   *  Example: "https://aipulse.dev". No trailing slash. */
  baseUrl: string;
  /** Per-recipient unsubscribe URL — already composed with the recipient's
   *  token, so the template doesn't need the token directly. */
  unsubUrl: string;
  /** Recipient's country code (ISO-3166-1 alpha-2) for the geo greeting.
   *  Null when unknown — the greeting drops the geo clause. */
  countryCode?: string | null;
};

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

  return (
    <Html>
      <Head />
      <Preview>{digest.subject}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>AI PULSE</Text>
          <Heading as="h1" style={styles.h1}>
            {digest.subject}
          </Heading>
          <Text style={styles.greeting}>{greeting}</Text>

          {digest.sections.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              permalink={permalink}
              baseUrl={baseUrl}
              date={digest.date}
            />
          ))}

          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            You&rsquo;re receiving this because you subscribed to the AI
            Pulse daily digest. Every number traces to a public source.{" "}
            <Link href={`${baseUrl}/privacy`} style={styles.link}>
              Privacy
            </Link>
            {" · "}
            <Link href={unsubUrl} style={styles.link}>
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
  permalink: string;
  baseUrl: string;
  date: string;
}): React.JSX.Element {
  const sectionUrl = `${baseUrl}/digest/${date}#${section.anchorSlug}`;
  const shareText = composeShareText(section.title, section.headline);
  const liUrl = buildShareUrl({
    platform: "linkedin",
    url: sectionUrl,
    text: shareText,
  });
  const xUrl = buildShareUrl({
    platform: "x",
    url: sectionUrl,
    text: shareText,
  });

  return (
    <Section style={styles.section}>
      <Heading as="h2" style={styles.h2}>
        {section.title}
      </Heading>
      <Text style={styles.sectionHeadline}>{section.headline}</Text>

      {section.items.length > 0 ? (
        <div>
          {section.items.map((item, i) => (
            <ItemRow key={i} item={item} />
          ))}
        </div>
      ) : null}

      {section.sourceUrls.length > 0 ? (
        <Text style={styles.sourceLine}>
          Source:{" "}
          {section.sourceUrls.map((u, i) => (
            <span key={u}>
              <Link href={u} style={styles.link}>
                {displaySource(u)}
              </Link>
              {i < section.sourceUrls.length - 1 ? ", " : ""}
            </span>
          ))}
        </Text>
      ) : null}

      <Text style={styles.actions}>
        <Link href={sectionUrl} style={styles.actionPrimary}>
          View on AI Pulse →
        </Link>
        {"   "}
        <Link href={liUrl} style={styles.actionSecondary}>
          Share on LinkedIn
        </Link>
        {"   "}
        <Link href={xUrl} style={styles.actionSecondary}>
          Share on X
        </Link>
      </Text>
    </Section>
  );
}

function ItemRow({ item }: { item: DigestSectionItem }): React.JSX.Element {
  return (
    <div style={styles.item}>
      <Text style={styles.itemHeadline}>
        <span style={styles.bullet}>›</span> {item.headline}
      </Text>
      {item.detail ? (
        <Text style={styles.itemDetail}>{item.detail}</Text>
      ) : null}
      {item.sourceUrl ? (
        <Text style={styles.itemSource}>
          <Link href={item.sourceUrl} style={styles.link}>
            {item.sourceLabel ?? displaySource(item.sourceUrl)}
          </Link>
        </Text>
      ) : null}
      {item.caveat ? (
        <Text style={styles.itemCaveat}>{item.caveat}</Text>
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

const styles = {
  body: { backgroundColor: "#0b0f17", color: "#e6e7eb", margin: 0 },
  container: {
    maxWidth: "620px",
    margin: "32px auto",
    padding: "32px",
    backgroundColor: "#111827",
    borderRadius: "12px",
  },
  brand: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.18em",
    color: "#2dd4bf",
    margin: 0,
  },
  h1: {
    fontSize: "22px",
    fontWeight: 700,
    margin: "8px 0 16px 0",
    color: "#e6e7eb",
  },
  greeting: {
    fontSize: "14px",
    lineHeight: "22px",
    color: "#c9cbd4",
    margin: "0 0 8px 0",
  },
  section: {
    margin: "28px 0",
    paddingTop: "20px",
    borderTop: "1px solid #1f2937",
  },
  h2: {
    fontSize: "16px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    color: "#2dd4bf",
    margin: "0 0 6px 0",
  },
  sectionHeadline: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#e6e7eb",
    margin: "0 0 12px 0",
  },
  item: { margin: "10px 0" },
  itemHeadline: {
    fontSize: "14px",
    lineHeight: "20px",
    color: "#e6e7eb",
    margin: 0,
  },
  bullet: { color: "#2dd4bf", marginRight: "6px" },
  itemDetail: {
    fontSize: "13px",
    lineHeight: "19px",
    color: "#c9cbd4",
    margin: "2px 0 0 14px",
  },
  itemSource: {
    fontSize: "11px",
    color: "#93c5fd",
    margin: "2px 0 0 14px",
  },
  itemCaveat: {
    fontSize: "11px",
    color: "#8a8f9c",
    fontStyle: "italic" as const,
    margin: "2px 0 0 14px",
  },
  sourceLine: {
    fontSize: "11px",
    color: "#8a8f9c",
    margin: "8px 0 0 0",
  },
  actions: {
    fontSize: "12px",
    margin: "14px 0 0 0",
  },
  actionPrimary: { color: "#2dd4bf", fontWeight: 600 },
  actionSecondary: { color: "#93c5fd" },
  hr: { borderColor: "#1f2937", margin: "28px 0 16px 0" },
  footer: { fontSize: "11px", color: "#6b7280", lineHeight: "18px" },
  link: { color: "#93c5fd" },
};

export default DigestEmail;
