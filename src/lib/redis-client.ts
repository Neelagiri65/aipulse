import { Redis } from "@upstash/redis";

/**
 * The one place an Upstash client is constructed.
 *
 * `cache: "default"`, not the client's own default `"no-store"`. Every command
 * is a fetch, and Next's patched fetch treats an explicit `cache: "no-store"`
 * as a dynamic-rendering opt-out for the whole route — a page that declares
 * `revalidate` and reads Redis silently renders per request with
 * `private, no-store` (that is what happened to /digest, /digest/<date> and
 * /sitemap.xml; verified on prod as x-vercel-cache MISS on every hit).
 *
 * "default" is what Next treats as "no cache config": the request is still
 * not cached by Next — writes from cron routes are never served from a cache,
 * reads on dynamic routes behave exactly as before — but a route keeps the
 * ISR it asked for. A guard test fails the build if `new Redis(` appears
 * anywhere else in src.
 */
export function createRedis(url: string, token: string): Redis {
  return new Redis({ url, token, cache: "default" });
}
