import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type ConfirmEmailProps = {
  confirmUrl: string;
  /**
   * Kept on the prop type for backwards-compat with the sendConfirm
   * caller (src/lib/email/resend.ts). The confirmation email itself
   * deliberately doesn't render an unsubscribe link — the recipient
   * hasn't agreed to anything yet, and "ignore this email and no
   * address will be added" is the correct opt-out before consent.
   */
  unsubUrl?: string;
};

export default function ConfirmEmail({ confirmUrl }: ConfirmEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        One click confirms — five things from the AI ecosystem, daily, every
        number sourced.
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>Gawk · daily AI digest</Text>

          <Text style={lead}>Confirm your subscription.</Text>

          <Text style={para}>
            One email a day. Never more. Five verifiable things moving in
            the AI ecosystem — model releases, benchmark shifts, regulator
            moves, lab hiring — pulled from the same public feeds you see
            on the dashboard. Nothing inferred or editorialised.
          </Text>

          <Section style={sample}>
            <Text style={sampleLabel}>Sample headline</Text>
            <Text style={sampleBody}>
              Anthropic released Claude Opus 4.7 ·{" "}
              <span style={sampleSrc}>source: anthropic.com/news</span>
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Button href={confirmUrl} style={button}>
              Confirm — start the daily digest
            </Button>
            <Text style={buttonHint}>This link expires in 24 hours.</Text>
          </Section>

          <Text style={fallbackLabel}>
            Button not working? Paste this URL into your browser:
          </Text>
          <Text style={fallbackUrl}>
            <Link href={confirmUrl} style={fallbackLink}>
              {confirmUrl}
            </Link>
          </Text>

          <Hr style={hr} />

          <Text style={small}>
            If you didn&rsquo;t sign up, ignore this email — no address gets
            added.
          </Text>
          <Text style={small}>
            We store a SHA-256 hash of your address plus a country tag.
            Nothing else. The plaintext address is encrypted at rest and only
            decrypted server-side at send time.
          </Text>

          <Text style={footer}>
            Gawk is built with data from public APIs. Every number on the
            dashboard traces to a source.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#0b0f17", color: "#e6e7eb", margin: 0 };
const container = {
  maxWidth: "560px",
  margin: "40px auto",
  padding: "32px",
  backgroundColor: "#111827",
  borderRadius: "12px",
};
const brand = {
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase" as const,
  color: "#2dd4bf",
  margin: 0,
};
const lead = {
  fontSize: "22px",
  fontWeight: 600,
  marginTop: "16px",
  marginBottom: "8px",
};
const para = { fontSize: "14px", lineHeight: "22px", color: "#c9cbd4" };
const sample = {
  margin: "16px 0",
  padding: "12px 14px",
  backgroundColor: "#0b1322",
  borderLeft: "3px solid #2dd4bf",
  borderRadius: "4px",
};
const sampleLabel = {
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "#6b7280",
  margin: 0,
  marginBottom: "4px",
};
const sampleBody = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#e6e7eb",
  margin: 0,
};
const sampleSrc = {
  fontSize: "11px",
  color: "#8a8f9c",
  fontStyle: "italic" as const,
};
const buttonSection = { margin: "20px 0 8px 0" };
const button = {
  backgroundColor: "#2dd4bf",
  color: "#052e2b",
  padding: "12px 20px",
  borderRadius: "8px",
  fontWeight: 600,
  textDecoration: "none",
};
const buttonHint = {
  fontSize: "12px",
  color: "#8a8f9c",
  marginTop: "10px",
  marginBottom: 0,
};
const fallbackLabel = {
  fontSize: "11px",
  color: "#8a8f9c",
  marginTop: "16px",
  marginBottom: "4px",
};
const fallbackUrl = {
  fontSize: "11px",
  wordBreak: "break-all" as const,
  margin: 0,
  marginBottom: "8px",
};
const fallbackLink = { color: "#93c5fd", textDecoration: "underline" };
const small = {
  fontSize: "12px",
  color: "#8a8f9c",
  lineHeight: "18px",
  marginBottom: "8px",
};
const hr = { borderColor: "#1f2937", margin: "20px 0 16px 0" };
const footer = {
  fontSize: "12px",
  color: "#6b7280",
  marginTop: "12px",
};
