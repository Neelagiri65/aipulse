import { describe, expect, it } from "vitest";
import {
  probeDkim,
  probeDmarc,
  probeResendDomain,
  probeSpf,
  type DnsResolver,
} from "@/lib/email/dns";

function resolver(answers: Record<string, string[][]>): DnsResolver {
  return {
    async resolveTxt(domain) {
      if (domain in answers) return answers[domain];
      const err = new Error(`ENOTFOUND ${domain}`);
      (err as { code?: string }).code = "ENOTFOUND";
      throw err;
    },
  };
}

describe("probeSpf", () => {
  it("reports ok when the domain has an SPF with include:_spf.resend.com", async () => {
    const r = resolver({
      "gawk.dev": [["v=spf1 include:_spf.resend.com ~all"]],
    });
    const result = await probeSpf("gawk.dev", { resolver: r });
    expect(result.configured).toBe(true);
    expect(result.message).toMatch(/SPF ok/);
  });

  it("reports missing when SPF exists but does not include resend", async () => {
    const r = resolver({
      "gawk.dev": [["v=spf1 include:_spf.google.com ~all"]],
    });
    const result = await probeSpf("gawk.dev", { resolver: r });
    expect(result.configured).toBe(false);
    expect(result.message).toMatch(/missing include/);
  });

  it("reports missing when no TXT record has v=spf1", async () => {
    const r = resolver({ "gawk.dev": [["something unrelated"]] });
    const result = await probeSpf("gawk.dev", { resolver: r });
    expect(result.configured).toBe(false);
  });

  it("reports resolver errors as not configured with the error message", async () => {
    const r = resolver({});
    const result = await probeSpf("gawk.dev", { resolver: r });
    expect(result.configured).toBe(false);
    expect(result.message).toMatch(/ENOTFOUND/);
  });
});

describe("probeDkim", () => {
  it("probes resend._domainkey.<domain> and accepts any p= record", async () => {
    const r = resolver({
      "resend._domainkey.gawk.dev": [
        ["v=DKIM1; k=rsa; p=AAAABBBBCCCC"],
      ],
    });
    const result = await probeDkim("gawk.dev", { resolver: r });
    expect(result.configured).toBe(true);
  });

  it("reports missing when no TXT record at the resend subdomain", async () => {
    const r = resolver({});
    const result = await probeDkim("gawk.dev", { resolver: r });
    expect(result.configured).toBe(false);
  });
});

describe("probeDmarc", () => {
  it("probes _dmarc.<domain> and requires v=DMARC1", async () => {
    const r = resolver({
      "_dmarc.gawk.dev": [
        ["v=DMARC1; p=quarantine; rua=mailto:dmarc@gawk.dev"],
      ],
    });
    const result = await probeDmarc("gawk.dev", { resolver: r });
    expect(result.configured).toBe(true);
  });

  it("reports missing on absent record", async () => {
    const r = resolver({});
    const result = await probeDmarc("gawk.dev", { resolver: r });
    expect(result.configured).toBe(false);
  });
});

describe("probeResendDomain", () => {
  it("returns not configured when no API key is set", async () => {
    const result = await probeResendDomain("gawk.dev", undefined);
    expect(result.configured).toBe(false);
    expect(result.message).toMatch(/not set/);
  });

  it("marks verified domain as configured", async () => {
    const result = await probeResendDomain(
      "gawk.dev",
      "re_test",
      async () => ({ verified: true, domains: ["gawk.dev"] }),
    );
    expect(result.configured).toBe(true);
  });

  it("marks present-but-unverified as not configured", async () => {
    const result = await probeResendDomain(
      "gawk.dev",
      "re_test",
      async () => ({ verified: false, domains: ["gawk.dev"] }),
    );
    expect(result.configured).toBe(false);
    expect(result.message).toMatch(/unverified/);
  });

  it("marks missing-from-list as not configured", async () => {
    const result = await probeResendDomain(
      "gawk.dev",
      "re_test",
      async () => ({ verified: true, domains: ["other.example"] }),
    );
    expect(result.configured).toBe(false);
    expect(result.message).toMatch(/not in Resend/);
  });

  it("reports fetch errors as not configured", async () => {
    const result = await probeResendDomain(
      "gawk.dev",
      "re_test",
      async () => {
        throw new Error("Resend /domains HTTP 500");
      },
    );
    expect(result.configured).toBe(false);
    expect(result.message).toMatch(/HTTP 500/);
  });
});
