import { describe, expect, it } from "vitest";
import {
  checkDomainVerified,
  type DomainClient,
  type ResendDomainRecord,
} from "@/lib/digest/domain-verify";

function client(records: ResendDomainRecord[]): DomainClient {
  return {
    get: async () => ({
      data: {
        id: "did",
        name: "aipulse.dev",
        status: "verified",
        records,
      },
      error: null,
    }),
  };
}

const DMARC_OK = async () => [["v=DMARC1; p=none; rua=mailto:d@example.com"]];
const DMARC_MISSING = async () => [];
const DMARC_UNREACHABLE = async () => {
  throw new Error("ENOTFOUND");
};

describe("checkDomainVerified — green path", () => {
  it("ok=true when SPF, DKIM, and DMARC are all verified", async () => {
    const r = await checkDomainVerified(
      client([
        { record: "SPF", status: "verified" },
        { record: "DKIM", status: "verified" },
      ]),
      "did",
      "aipulse.dev",
      { dmarcResolver: DMARC_OK },
    );
    expect(r.ok).toBe(true);
    expect(r.spf).toBe("verified");
    expect(r.dkim).toBe("verified");
    expect(r.dmarc).toBe("verified");
    expect(r.failingRecords).toEqual([]);
  });
});

describe("checkDomainVerified — failing records", () => {
  it("flags SPF when not verified", async () => {
    const r = await checkDomainVerified(
      client([
        { record: "SPF", status: "pending" },
        { record: "DKIM", status: "verified" },
      ]),
      "did",
      "aipulse.dev",
      { dmarcResolver: DMARC_OK },
    );
    expect(r.ok).toBe(false);
    expect(r.failingRecords).toContain("SPF");
  });

  it("flags DKIM when not verified", async () => {
    const r = await checkDomainVerified(
      client([
        { record: "SPF", status: "verified" },
        { record: "DKIM", status: "failed" },
      ]),
      "did",
      "aipulse.dev",
      { dmarcResolver: DMARC_OK },
    );
    expect(r.ok).toBe(false);
    expect(r.failingRecords).toContain("DKIM");
  });

  it("flags DMARC when the TXT record is missing", async () => {
    const r = await checkDomainVerified(
      client([
        { record: "SPF", status: "verified" },
        { record: "DKIM", status: "verified" },
      ]),
      "did",
      "aipulse.dev",
      { dmarcResolver: DMARC_MISSING },
    );
    expect(r.ok).toBe(false);
    expect(r.dmarc).toBe("missing");
    expect(r.failingRecords).toContain("DMARC");
  });

  it("flags DMARC when DNS lookup errors", async () => {
    const r = await checkDomainVerified(
      client([
        { record: "SPF", status: "verified" },
        { record: "DKIM", status: "verified" },
      ]),
      "did",
      "aipulse.dev",
      { dmarcResolver: DMARC_UNREACHABLE },
    );
    expect(r.ok).toBe(false);
    expect(r.dmarc).toBe("unreachable");
  });
});

describe("checkDomainVerified — multiple DKIM records", () => {
  it("worst DKIM status wins", async () => {
    const r = await checkDomainVerified(
      client([
        { record: "SPF", status: "verified" },
        { record: "DKIM", status: "verified" },
        { record: "DKIM", status: "pending" },
      ]),
      "did",
      "aipulse.dev",
      { dmarcResolver: DMARC_OK },
    );
    expect(r.dkim).toBe("pending");
    expect(r.ok).toBe(false);
  });
});

describe("checkDomainVerified — top-level errors", () => {
  it("records error when resend.get returns an error body", async () => {
    const c: DomainClient = {
      get: async () => ({ data: null, error: { message: "unauthorized" } }),
    };
    const r = await checkDomainVerified(c, "did", "aipulse.dev", {
      dmarcResolver: DMARC_OK,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("unauthorized");
  });

  it("records error when the client throws", async () => {
    const c: DomainClient = {
      get: async () => {
        throw new Error("network");
      },
    };
    const r = await checkDomainVerified(c, "did", "aipulse.dev", {
      dmarcResolver: DMARC_OK,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("network");
  });
});
