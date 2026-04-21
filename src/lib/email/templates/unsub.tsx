import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

export type UnsubscribeReceiptProps = {
  resubscribeUrl: string;
};

export default function UnsubscribeReceipt({
  resubscribeUrl,
}: UnsubscribeReceiptProps) {
  return (
    <Html>
      <Head />
      <Preview>You have unsubscribed from AI Pulse</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={h1}>AI Pulse</Text>
          <Text style={lead}>You&rsquo;ve been unsubscribed.</Text>
          <Text style={para}>
            We won&rsquo;t email you again. This action took effect
            immediately and your address has been removed from the active
            list.
          </Text>
          <Text style={para}>
            If this was a mistake,{" "}
            <Link href={resubscribeUrl} style={link}>
              re-subscribe
            </Link>{" "}
            and confirm the new address — we&rsquo;ll start fresh.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            AI Pulse never sends re-engagement emails to unsubscribed
            addresses.
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
const hr = { borderColor: "#1f2937", margin: "24px 0" };
const footer = { fontSize: "12px", color: "#6b7280" };
const link = { color: "#93c5fd" };
