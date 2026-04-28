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
  unsubUrl: string;
};

export default function ConfirmEmail({
  confirmUrl,
  unsubUrl,
}: ConfirmEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your Gawk subscription</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={h1}>Gawk</Text>
          <Text style={lead}>
            Confirm your subscription to the daily digest.
          </Text>
          <Text style={para}>
            You (or someone using your address) asked to receive the Gawk
            daily digest — five verifiable things moving in the AI ecosystem,
            delivered every day with sources cited. Click below to confirm
            within 24 hours.
          </Text>
          <Section style={buttonSection}>
            <Button href={confirmUrl} style={button}>
              Confirm my subscription
            </Button>
          </Section>
          <Text style={small}>
            If you didn&rsquo;t sign up, ignore this email and no address will
            be added.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            Gawk is built with data from public APIs. Every number on the
            dashboard traces to a source.{" "}
            <Link href={unsubUrl} style={link}>
              Unsubscribe
            </Link>
            .
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
const h1 = { fontSize: "22px", fontWeight: 700, letterSpacing: "0.04em", margin: 0 };
const lead = { fontSize: "18px", fontWeight: 600, marginTop: "12px" };
const para = { fontSize: "14px", lineHeight: "22px", color: "#c9cbd4" };
const buttonSection = { margin: "24px 0" };
const button = {
  backgroundColor: "#2dd4bf",
  color: "#052e2b",
  padding: "12px 20px",
  borderRadius: "8px",
  fontWeight: 600,
  textDecoration: "none",
};
const small = { fontSize: "12px", color: "#8a8f9c" };
const hr = { borderColor: "#1f2937", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#6b7280" };
const link = { color: "#93c5fd" };
