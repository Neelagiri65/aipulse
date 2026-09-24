/**
 * Publisher images, relayed through gawk.dev (founder, 2026-09-24).
 *
 * The iOS app may only talk to gawk.dev (gawk-ios constraint 2), and a reader's phone should not
 * contact every publisher's CDN. So the app asks for `/api/rss/image/<itemId>` and gawk.dev fetches
 * the image the publisher attached to that item in its own feed.
 *
 * Not an open proxy: the URL is read from gawk.dev's stored item, never taken from the request.
 * Defence in depth on top of that, because the URL still came from a third-party feed:
 * https hostnames only (no IP literals, localhost or internal names), the post-redirect URL is
 * re-checked, images only and never SVG (it can carry script on gawk.dev's origin), a size cap and
 * a timeout. The original URL is stated in a response header so the relay is traceable.
 */
import type { RssItem } from "@/lib/data/wire-rss";

export const IMAGE_ID_RE = /^[0-9a-f]{16}$/;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 8000;
/** A week at the edge: a publisher's article image does not change, and it spares their CDN. */
export const IMAGE_CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

export function isFetchableImageUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (host.startsWith("[") || /^[0-9.]+$/.test(host) || host.includes(":")) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  return host.includes(".");
}

export type ImageProxyResult = {
  status: number;
  headers: Record<string, string>;
  body?: Uint8Array;
  error?: string;
};

export type ImageProxyDeps = {
  readItem: (id: string) => Promise<RssItem | null>;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
};

const fail = (status: number, error: string): ImageProxyResult => ({
  status,
  error,
  // A missing or refused image is not cached for long: the item may gain one on the next ingest.
  headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
});

export async function proxyRssImage(id: string, deps: ImageProxyDeps): Promise<ImageProxyResult> {
  if (!IMAGE_ID_RE.test(id)) return fail(400, "invalid_id");
  const item = await deps.readItem(id);
  if (!item) return fail(404, "item_not_found");
  const src = item.imageUrl;
  if (!src) return fail(404, "no_image");
  if (!isFetchableImageUrl(src)) return fail(422, "image_url_off_limits");

  const doFetch = deps.fetch ?? ((u: string, i?: RequestInit) => fetch(u, i));
  let res: Response;
  try {
    res = await doFetch(src, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8", "user-agent": "gawk.dev-image-relay/1.0 (+https://gawk.dev)" },
    });
  } catch {
    return fail(502, "upstream_unreachable");
  }
  if (!res.ok) return fail(502, `upstream_${res.status}`);
  if (res.url && !isFetchableImageUrl(res.url)) return fail(502, "redirected_off_limits");
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/") || type === "image/svg+xml") return fail(502, "not_an_image");
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_IMAGE_BYTES) return fail(502, "too_large");

  const body = new Uint8Array(await res.arrayBuffer());
  if (body.byteLength > MAX_IMAGE_BYTES) return fail(502, "too_large");
  return {
    status: 200,
    body,
    headers: {
      "content-type": type,
      "cache-control": IMAGE_CACHE_CONTROL,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
      "x-gawk-image-source": src,
    },
  };
}
