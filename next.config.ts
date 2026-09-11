import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // /registry has never been a page — only /api/registry/* exists.
      // Redirect to home rather than 404 so anyone who guesses the URL
      // (or follows a stale external link) lands on the dashboard that
      // surfaces the registry-derived AI-config repos.
      { source: "/registry", destination: "/", permanent: false },
      // One canonical host. www.gawk.dev served the whole site as a
      // duplicate and Google was picking the www URL in results even
      // though every page canonicalises to the apex. 301 it at the edge.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.gawk.dev" }],
        destination: "https://gawk.dev/:path*",
        permanent: true,
      },
      // /index rendered the homepage under a second URL.
      { source: "/index", destination: "/", permanent: true },
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
