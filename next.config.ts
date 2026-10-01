import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Middleware runs on /api/*, and Next truncates the request body it clones
    // for middleware at 10MB by default — which broke 20MB media uploads and
    // large CSV imports. Keep this above the largest upload the API accepts.
    middlewareClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
