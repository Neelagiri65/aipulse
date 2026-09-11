/**
 * The sample gate must not be shared between deployment environments.
 *
 * `claimSampleSlot` is a mutual exclusion lock: exactly one claimant per TTL
 * wins and records a round of samples. With one global key that "one claimant"
 * spans every deployment of the project, so a preview render could take
 * production's slot and leave a 290s hole in its sampling — with no error
 * anywhere, and nothing in the data to distinguish it from a quiet moment.
 *
 * This is cheap insurance against a deployment setting nobody has checked. The
 * test exists because the defect it prevents is invisible: nothing fails, a
 * round is simply missing.
 */
import { afterEach, describe, expect, it } from "vitest";

import { sampleGateKey } from "@/lib/data/status-history";

const original = process.env.VERCEL_ENV;

afterEach(() => {
  if (original === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = original;
});

describe("the sample gate is namespaced by deployment environment", () => {
  it("gives production and preview different keys", () => {
    process.env.VERCEL_ENV = "production";
    const production = sampleGateKey();
    process.env.VERCEL_ENV = "preview";
    const preview = sampleGateKey();

    expect(production).not.toBe(preview);
  });

  it("keeps every environment distinct, including an unset one", () => {
    const keys = new Set<string>();
    for (const env of ["production", "preview", "development"]) {
      process.env.VERCEL_ENV = env;
      keys.add(sampleGateKey());
    }
    delete process.env.VERCEL_ENV;
    keys.add(sampleGateKey());

    expect(keys.size).toBe(4);
  });

  it("reads the environment at call time, not at module load", () => {
    // Frozen at module scope, a test could pass while the deployed build had
    // baked in whatever value happened to be set when it was compiled.
    process.env.VERCEL_ENV = "production";
    const first = sampleGateKey();
    process.env.VERCEL_ENV = "preview";

    expect(sampleGateKey()).not.toBe(first);
  });

  it("still namespaces under the project's own prefix", () => {
    process.env.VERCEL_ENV = "production";
    expect(sampleGateKey()).toMatch(/^aipulse:sample-gate:/);
  });
});
