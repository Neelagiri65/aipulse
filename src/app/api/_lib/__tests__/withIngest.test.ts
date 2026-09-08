/**
 * withIngest auth — the only thing standing between an attacker and our
 * Redis writes, so the `acceptCronSecret` opt-in gets pinned explicitly.
 *
 * The branch that must never regress: an UNSET CRON_SECRET has to stay a
 * closed door. Vercel only sends `Authorization: Bearer` when that env
 * var exists, so a naive "no secret configured → allow" would open the
 * route to anyone the moment the env var went missing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/cron-health", () => ({
  writeCronHealth: vi.fn(async () => true),
}));

import { withIngest } from "@/app/api/_lib/withIngest";

const INGEST = "ingest-key";
const CRON = "cron-key";

function handler(opts: { acceptCronSecret?: boolean } = {}) {
  return withIngest<{ ran: true }>({
    workflow: "video-watchdog-vercel",
    acceptCronSecret: opts.acceptCronSecret,
    run: async () => ({ ran: true }),
    toOutcome: () => ({ ok: true, itemsProcessed: 1 }),
  });
}

function req(headers: Record<string, string>) {
  return new Request("https://gawk.dev/api/cron/video-watchdog", { headers });
}

afterEach(() => {
  delete process.env.INGEST_SECRET;
  delete process.env.CRON_SECRET;
});

describe("withIngest auth", () => {
  it("503s when INGEST_SECRET is unset, whatever the caller sends", async () => {
    process.env.CRON_SECRET = CRON;
    const res = await handler({ acceptCronSecret: true })(
      req({ authorization: `Bearer ${CRON}` }),
    );
    expect(res.status).toBe(503);
  });

  it("accepts x-ingest-secret — unchanged for every existing route", async () => {
    process.env.INGEST_SECRET = INGEST;
    const res = await handler()(req({ "x-ingest-secret": INGEST }));
    expect(res.status).toBe(200);
  });

  it("rejects a wrong x-ingest-secret", async () => {
    process.env.INGEST_SECRET = INGEST;
    const res = await handler()(req({ "x-ingest-secret": "nope" }));
    expect(res.status).toBe(401);
  });

  it("accepts Vercel's Bearer CRON_SECRET when the route opts in", async () => {
    process.env.INGEST_SECRET = INGEST;
    process.env.CRON_SECRET = CRON;
    const res = await handler({ acceptCronSecret: true })(
      req({ authorization: `Bearer ${CRON}` }),
    );
    expect(res.status).toBe(200);
  });

  it("ignores the Bearer header on routes that did NOT opt in", async () => {
    process.env.INGEST_SECRET = INGEST;
    process.env.CRON_SECRET = CRON;
    const res = await handler()(req({ authorization: `Bearer ${CRON}` }));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong Bearer even when opted in", async () => {
    process.env.INGEST_SECRET = INGEST;
    process.env.CRON_SECRET = CRON;
    const res = await handler({ acceptCronSecret: true })(
      req({ authorization: "Bearer wrong" }),
    );
    expect(res.status).toBe(401);
  });

  it("THE TRAP: unset CRON_SECRET never authorises a bare/empty Bearer", async () => {
    process.env.INGEST_SECRET = INGEST;
    const opted = handler({ acceptCronSecret: true });
    expect((await opted(req({ authorization: "Bearer " }))).status).toBe(401);
    expect((await opted(req({ authorization: "Bearer undefined" }))).status).toBe(
      401,
    );
    expect((await opted(req({}))).status).toBe(401);
  });

  it("empty-string CRON_SECRET is treated as unset, not as a valid key", async () => {
    process.env.INGEST_SECRET = INGEST;
    process.env.CRON_SECRET = "";
    const res = await handler({ acceptCronSecret: true })(
      req({ authorization: "Bearer " }),
    );
    expect(res.status).toBe(401);
  });
});
