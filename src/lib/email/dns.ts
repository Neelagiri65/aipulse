/**
 * dns — lightweight probes for the three records /api/debug/email-health
 * reports on: SPF, DKIM, DMARC. Each probe returns a human-readable
 * `{configured, message}` shape matching the existing debug endpoint.
 *
 * Probes are tolerant: a missing record is an expected "not yet" state
 * during the domain-setup window. The caller decides whether "degraded"
 * is a hard error.
 *
 * Resolver is injected so tests don't hit real DNS. Defaults to
 * node:dns/promises when not provided.
 */

export type DnsResolver = {
  resolveTxt(domain: string): Promise<string[][]>;
};

export type ProbeResult = {
  configured: boolean;
  message: string;
};

type ProbeOpts = {
  resolver?: DnsResolver;
};

async function defaultResolver(): Promise<DnsResolver> {
  const mod = await import("node:dns/promises");
  return { resolveTxt: (d) => mod.resolveTxt(d) };
}

async function resolver(opts?: ProbeOpts): Promise<DnsResolver> {
  return opts?.resolver ?? (await defaultResolver());
}

export async function probeSpf(domain: string, opts?: ProbeOpts): Promise<ProbeResult> {
  try {
    const r = await resolver(opts);
    const records = await r.resolveTxt(domain);
    const joined = records.map((parts) => parts.join(""));
    const spf = joined.find((s) => s.trim().toLowerCase().startsWith("v=spf1"));
    if (!spf) {
      return { configured: false, message: `no SPF TXT record on ${domain}` };
    }
    if (!spf.includes("resend.com")) {
      return {
        configured: false,
        message: `SPF present but missing include:_spf.resend.com — ${spf}`,
      };
    }
    return { configured: true, message: `SPF ok: ${spf}` };
  } catch (e) {
    return { configured: false, message: toMessage(e) };
  }
}

export async function probeDkim(
  domain: string,
  opts?: ProbeOpts,
): Promise<ProbeResult> {
  const target = `resend._domainkey.${domain}`;
  try {
    const r = await resolver(opts);
    const records = await r.resolveTxt(target);
    const joined = records.map((parts) => parts.join(""));
    const dkim = joined.find((s) => s.includes("p="));
    if (!dkim) {
      return {
        configured: false,
        message: `no DKIM public key at ${target}`,
      };
    }
    return { configured: true, message: `DKIM ok at ${target}` };
  } catch (e) {
    return { configured: false, message: toMessage(e) };
  }
}

export async function probeDmarc(
  domain: string,
  opts?: ProbeOpts,
): Promise<ProbeResult> {
  const target = `_dmarc.${domain}`;
  try {
    const r = await resolver(opts);
    const records = await r.resolveTxt(target);
    const joined = records.map((parts) => parts.join(""));
    const dmarc = joined.find((s) => s.trim().toLowerCase().startsWith("v=dmarc1"));
    if (!dmarc) {
      return {
        configured: false,
        message: `no DMARC TXT record at ${target}`,
      };
    }
    return { configured: true, message: `DMARC ok: ${dmarc}` };
  } catch (e) {
    return { configured: false, message: toMessage(e) };
  }
}

function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export type ResendDomainStatus = ProbeResult;

export type ResendDomainsFetcher = (
  apiKey: string,
) => Promise<{ verified: boolean; domains: string[] }>;

export async function probeResendDomain(
  domain: string,
  apiKey: string | undefined,
  fetcher?: ResendDomainsFetcher,
): Promise<ResendDomainStatus> {
  if (!apiKey) {
    return { configured: false, message: "RESEND_API_KEY not set" };
  }
  try {
    const actualFetcher = fetcher ?? defaultResendDomainsFetcher;
    const result = await actualFetcher(apiKey);
    const hit = result.domains.map((d) => d.toLowerCase()).includes(domain.toLowerCase());
    if (!hit) {
      return {
        configured: false,
        message: `${domain} not in Resend /domains (known: ${result.domains.join(", ") || "none"})`,
      };
    }
    return result.verified
      ? { configured: true, message: `${domain} verified in Resend` }
      : { configured: false, message: `${domain} present but unverified in Resend` };
  } catch (e) {
    return { configured: false, message: toMessage(e) };
  }
}

const defaultResendDomainsFetcher: ResendDomainsFetcher = async (apiKey) => {
  const resp = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    throw new Error(`Resend /domains HTTP ${resp.status}`);
  }
  const body = (await resp.json()) as {
    data?: Array<{ name: string; status: string }>;
  };
  const rows = body.data ?? [];
  return {
    verified: rows.some((d) => d.status === "verified"),
    domains: rows.map((d) => d.name),
  };
};
