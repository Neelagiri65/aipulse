/**
 * Deliverability hard-gate for digest send.
 *
 * Resend owns SPF + DKIM status (the sender's domain is registered there
 * and Resend checks those records as part of `domains.get(id)`). DMARC is
 * a domain-owner responsibility — not something Resend publishes — so we
 * check `_dmarc.<domain>` via DNS ourselves.
 *
 * All three must be green before a batch goes out. A non-verified send
 * risks Gmail/Outlook spam-folder placement on the very first delivery,
 * which can permanently damage the sending-domain reputation. Better to
 * abort cleanly and alert operator.
 *
 * Returns a structured result — the caller (send route) decides whether
 * to continue or record a cron-health failure.
 */

import { resolveTxt } from "node:dns/promises";

export type DomainVerifyRecordStatus =
  | "pending"
  | "verified"
  | "failed"
  | "temporary_failure"
  | "not_started";

/** Minimal interface over Resend's domains.get(id) response. We deliberately
 *  don't import the full SDK types so tests can stub without pulling resend. */
export type ResendDomainRecord = {
  record: string;
  status: DomainVerifyRecordStatus | string;
  name?: string;
};

export type ResendGetDomainSuccess = {
  id: string;
  name: string;
  status: string;
  records: ResendDomainRecord[];
};

export type DomainClient = {
  get: (
    id: string,
  ) => Promise<{
    data: ResendGetDomainSuccess | null;
    error: { message?: string } | null;
  }>;
};

export type DmarcResolver = (
  domain: string,
) => Promise<string[][] | string[]>;

export type CheckDomainVerifiedOpts = {
  dmarcResolver?: DmarcResolver;
};

export type DomainVerifyResult = {
  ok: boolean;
  spf: DomainVerifyRecordStatus | "missing";
  dkim: DomainVerifyRecordStatus | "missing";
  dmarc: "verified" | "missing" | "unreachable";
  failingRecords: string[];
  error?: string;
};

export async function checkDomainVerified(
  resendDomains: DomainClient,
  domainId: string,
  domainName: string,
  opts: CheckDomainVerifiedOpts = {},
): Promise<DomainVerifyResult> {
  let spf: DomainVerifyResult["spf"] = "missing";
  let dkim: DomainVerifyResult["dkim"] = "missing";
  const failing: string[] = [];
  let topLevelError: string | undefined;

  try {
    const { data, error } = await resendDomains.get(domainId);
    if (error) {
      topLevelError = error.message ?? "resend domains.get errored";
    } else if (data) {
      for (const rec of data.records) {
        const s = rec.status as DomainVerifyRecordStatus;
        if (rec.record === "SPF") spf = s;
        if (rec.record === "DKIM") {
          // Multiple DKIM records are possible; the weakest wins.
          dkim = worstStatus(dkim === "missing" ? "verified" : dkim, s);
        }
      }
    }
  } catch (e) {
    topLevelError = e instanceof Error ? e.message : String(e);
  }

  if (spf !== "verified") failing.push("SPF");
  if (dkim !== "verified") failing.push("DKIM");

  const dmarc = await resolveDmarc(domainName, opts.dmarcResolver);
  if (dmarc !== "verified") failing.push("DMARC");

  return {
    ok: failing.length === 0 && !topLevelError,
    spf,
    dkim,
    dmarc,
    failingRecords: failing,
    error: topLevelError,
  };
}

function worstStatus(
  a: DomainVerifyRecordStatus,
  b: DomainVerifyRecordStatus,
): DomainVerifyRecordStatus {
  const order: DomainVerifyRecordStatus[] = [
    "verified",
    "pending",
    "temporary_failure",
    "not_started",
    "failed",
  ];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

async function resolveDmarc(
  domain: string,
  resolver?: DmarcResolver,
): Promise<DomainVerifyResult["dmarc"]> {
  const resolve = resolver ?? resolveTxt;
  try {
    const records = await resolve(`_dmarc.${domain}`);
    const flat: string[] = records.map((r) =>
      Array.isArray(r) ? r.join("") : r,
    );
    const found = flat.some((r) => /^v=DMARC1/i.test(r.trim()));
    return found ? "verified" : "missing";
  } catch {
    return "unreachable";
  }
}
