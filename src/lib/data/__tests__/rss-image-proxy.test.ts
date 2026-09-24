/**
 * The publisher-image proxy. The app may only talk to gawk.dev (gawk-ios constraint 2), so a
 * publisher's image reaches the phone through /api/rss/image/<itemId>. It is NOT an open proxy:
 * the URL comes from gawk.dev's own stored item, never from the request.
 */
import { describe, expect, it, vi } from "vitest";
import { isFetchableImageUrl, proxyRssImage } from "@/lib/data/rss-image-proxy";
import type { RssItem } from "@/lib/data/wire-rss";

const ID = "0123456789abcdef";
const item = (imageUrl: string | null | undefined): RssItem => ({
  id: ID, sourceId: "the-register-ai", title: "t", url: "https://www.theregister.com/a", publishedTs: 1,
  firstSeenTs: "x", lastRefreshTs: "x", description: "", imageUrl,
});
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const okFetch = (body: Uint8Array = png, type = "image/jpeg", url = "https://image.theregister.com/?imageId=1") =>
  vi.fn(async () => Object.defineProperty(new Response(body as unknown as BodyInit, { status: 200, headers: { "content-type": type } }), "url", { value: url }));

describe("which URLs may be fetched", () => {
  it("https hostnames only; no IP literals, localhost or internal names; no credentials", () => {
    expect(isFetchableImageUrl("https://image.theregister.com/?imageId=1&width=800")).toBe(true);
    expect(isFetchableImageUrl("http://image.theregister.com/a.jpg")).toBe(false);
    expect(isFetchableImageUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isFetchableImageUrl("https://[::1]/a.jpg")).toBe(false);
    expect(isFetchableImageUrl("https://localhost/a.jpg")).toBe(false);
    expect(isFetchableImageUrl("https://db.internal/a.jpg")).toBe(false);
    expect(isFetchableImageUrl("https://user:pw@example.com/a.jpg")).toBe(false);
    expect(isFetchableImageUrl("not a url")).toBe(false);
  });
});

describe("proxyRssImage", () => {
  it("relays the publisher's image with a long edge cache, nosniff, and the original URL stated", async () => {
    const fetch = okFetch();
    const r = await proxyRssImage(ID, { readItem: async () => item("https://image.theregister.com/?imageId=1"), fetch });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("image/jpeg");
    expect(r.headers["cache-control"]).toContain("s-maxage=604800");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-gawk-image-source"]).toBe("https://image.theregister.com/?imageId=1");
    expect(r.body).toEqual(png);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("400 for an id that is not one of ours; never touches the store", async () => {
    const readItem = vi.fn();
    expect((await proxyRssImage("../../etc", { readItem, fetch: okFetch() })).status).toBe(400);
    expect(readItem).not.toHaveBeenCalled();
  });
  it("404 when the item is gone or carries no image — with the reason", async () => {
    const a = await proxyRssImage(ID, { readItem: async () => null, fetch: okFetch() });
    expect(a.status).toBe(404);
    expect(a.error).toBe("item_not_found");
    const b = await proxyRssImage(ID, { readItem: async () => item(null), fetch: okFetch() });
    expect(b.status).toBe(404);
    expect(b.error).toBe("no_image");
  });
  it("refuses a stored URL that points at an IP or internal host", async () => {
    const fetch = okFetch();
    const r = await proxyRssImage(ID, { readItem: async () => item("https://10.0.0.1/a.jpg"), fetch });
    expect(r.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses SVG (script from gawk.dev's origin) and anything that is not an image", async () => {
    const svg = await proxyRssImage(ID, { readItem: async () => item("https://x.com/a.svg"), fetch: okFetch(png, "image/svg+xml") });
    expect(svg.status).toBe(502);
    const html = await proxyRssImage(ID, { readItem: async () => item("https://x.com/a"), fetch: okFetch(png, "text/html") });
    expect(html.status).toBe(502);
  });
  it("refuses an image over the size cap", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    const r = await proxyRssImage(ID, { readItem: async () => item("https://x.com/a.jpg"), fetch: okFetch(big) });
    expect(r.status).toBe(502);
    expect(r.error).toBe("too_large");
  });
  it("refuses when a redirect lands on an IP", async () => {
    const r = await proxyRssImage(ID, { readItem: async () => item("https://x.com/a.jpg"), fetch: okFetch(png, "image/jpeg", "https://192.168.1.1/a.jpg") });
    expect(r.status).toBe(502);
    expect(r.error).toBe("redirected_off_limits");
  });
  it("an upstream failure is a 502 naming the status", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 404 }));
    const r = await proxyRssImage(ID, { readItem: async () => item("https://x.com/a.jpg"), fetch });
    expect(r.status).toBe(502);
    expect(r.error).toBe("upstream_404");
  });
});
