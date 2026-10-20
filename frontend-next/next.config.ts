import type { NextConfig } from "next";

// API_PROXY_TARGET is server-only (Docker: http://backend:3001) so it never
// leaks into the browser bundle; NEXT_PUBLIC_API_URL remains the dev fallback.
// Rewrites are serialized into the standalone server at BUILD time, so in
// Docker this must be passed as a build arg, not a runtime env var.
const API_TARGET =
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

const nextConfig: NextConfig = {
  // Emit .next/standalone for the Docker image — a self-contained server.js
  // that runs without node_modules.
  output: "standalone",
  // Proxy /api/* to the (unchanged) Express backend so the frontend can keep
  // making same-origin requests — mirrors the old Vite dev proxy. In production
  // the app runs behind the same reverse proxy, so /api resolves there too.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
