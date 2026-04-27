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
};

export default nextConfig;
