import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // /registry has never been a page — only /api/registry/* exists.
      // Redirect to home rather than 404 so anyone who guesses the URL
      // (or follows a stale external link) lands on the dashboard that
      // surfaces the registry-derived AI-config repos.
      { source: "/registry", destination: "/", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // Crawlers are allowed to FETCH the read-only JSON endpoints (see
        // app/robots.ts) so Googlebot's render pass sees real numbers instead
        // of "awaiting first poll". They must not LIST the JSON as a search
        // result — that is what this header says, and it is the half of the
        // pairing robots.txt cannot express.
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};

export default nextConfig;
