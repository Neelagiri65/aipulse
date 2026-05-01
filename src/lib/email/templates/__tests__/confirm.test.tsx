import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ConfirmEmail from "@/lib/email/templates/confirm";

const URL = "https://gawk.dev/api/subscribe/confirm?token=abc.def";

describe("ConfirmEmail", () => {
  it("renders the brand line, the confirm button, and the cadence promise", () => {
    const html = renderToStaticMarkup(ConfirmEmail({ confirmUrl: URL }));
    expect(html).toContain("Gawk");
    expect(html).toContain("daily AI digest");
    expect(html).toContain("Confirm");
    expect(html).toContain("One email a day. Never more.");
  });

  it("links the primary CTA at the supplied confirmUrl", () => {
    const html = renderToStaticMarkup(ConfirmEmail({ confirmUrl: URL }));
    // Both the button and the raw-URL fallback point at the same href.
    const matches = html.match(new RegExp(`href="${URL.replace(/[?.]/g, (c) => `\\${c}`)}"`, "g"));
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("includes a paste-the-URL fallback so the human can recover when the button fails", () => {
    const html = renderToStaticMarkup(ConfirmEmail({ confirmUrl: URL }));
    expect(html).toMatch(/paste this url/i);
    expect(html).toContain(URL);
  });

  it("warns the user the link expires within 24h, near the button", () => {
    const html = renderToStaticMarkup(ConfirmEmail({ confirmUrl: URL }));
    expect(html).toMatch(/expires in 24 hours/i);
  });

  it("does not render an unsubscribe link — the recipient hasn't consented yet", () => {
    const html = renderToStaticMarkup(
      ConfirmEmail({ confirmUrl: URL, unsubUrl: "https://gawk.dev/unsub" }),
    );
    expect(html).not.toMatch(/unsubscribe/i);
    // The "ignore this email and no address gets added" line is the
    // pre-consent equivalent of an unsub link.
    expect(html).toMatch(/ignore this email/i);
  });

  it("states the privacy posture explicitly (SHA-256 + country tag, plaintext encrypted at rest)", () => {
    const html = renderToStaticMarkup(ConfirmEmail({ confirmUrl: URL }));
    expect(html).toMatch(/SHA-256/i);
    expect(html).toMatch(/country tag/i);
    expect(html).toMatch(/encrypted at rest/i);
  });

  it("includes a representative sample headline so the user knows what they're signing up for", () => {
    const html = renderToStaticMarkup(ConfirmEmail({ confirmUrl: URL }));
    expect(html).toMatch(/sample headline/i);
    expect(html).toContain("source:");
  });
});
