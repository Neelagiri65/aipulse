import { describe, expect, it } from "vitest";

import { APP_STORE_ID, APP_STORE_URL } from "@/lib/app-store";

describe("App Store identity", () => {
  it("is one id, and the URL carries it with no storefront prefix", () => {
    expect(APP_STORE_ID).toMatch(/^\d{10}$/);
    expect(APP_STORE_URL).toBe("https://apps.apple.com/app/gawk-dev/id6810342350");
    expect(APP_STORE_URL).not.toMatch(/apps\.apple\.com\/[a-z]{2}\//);
  });
});
